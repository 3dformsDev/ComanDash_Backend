import Location from "#models/location";
import CashRegisterSession from "#models/cash_registers_session";
import Order from "#models/order";
import {
  cancelOrderValidator,
  createOrderValidator,
  updateOrderValidator,
} from "#validators/order";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { DateTime } from "luxon";
import OrderItem from "#models/order_item";
import Product from "#models/product";
import { Decimal } from "decimal.js"; // MODIFICADO: Importar Decimal.js
import OrderStatusHistory from "#models/order_status_history";
import OrderPayment from "#models/order_payment";
import CashMovement from "#models/cash_movement";
import Table from "#models/table";
import { io } from "#start/socket";
import firebaseService from "#services/firebase_service";
import cache from "@adonisjs/cache/services/main";
import OrderAdjustmentService from "#services/orders/order_adjustment_service";
import OrderAdjustment from "#models/order_adjustment";
import CashRegisterOperatingService from "#services/cash_register_operating_service";

function businessDateValue(value?: string): DateTime | undefined {
  return value ? DateTime.fromISO(value) : undefined;
}

export default class OrdersController {
  /**
   * Muestra una lista paginada de órdenes para la compañía del usuario.
   */
  async index({
    request,
    response,
    companyId,
    getQueryData,
    auth,
  }: HttpContext) {
    // ... (sin cambios en este método)
    const { page = 1, perPage = 10 } = getQueryData();

    const qs = request.qs();
    const cashRegisterSessionId = qs.cash_register_session_id
      ? qs.cash_register_session_id
      : null;
    const locationId = qs.location_id ? qs.location_id : null;
    const withSeesionId = qs.withSeesionId ? qs.withSeesionId : null;

    let query = Order.withCompanyFilter(companyId);

    if (locationId) {
      const locationExists = await Location.withCompanyFilter(companyId)
        .andWhere("id", locationId)
        .first();

      if (!locationExists) {
        return response.status(404).json({
          success: false,
          message:
            "La sucursal no fue encontrada o no pertenece a esta compañía.",
        });
      }

      query.where("location_id", locationId);
    }

    if (cashRegisterSessionId) {
      const cashRegisterSessionExists =
        await CashRegisterSession.queryWithCompany(companyId)
          .andWhere("id", cashRegisterSessionId)
          .first();

      if (!cashRegisterSessionExists) {
        return response.status(404).json({
          success: false,
          message:
            "La la sesión no fue encontrada o no pertenece a esta compañía.",
        });
      }

      query.where("cash_register_session_id", cashRegisterSessionId);
    }

    if (withSeesionId) {
      const user = auth.user!;
      const openSession = await CashRegisterSession.query()
        .where("company_id", companyId)
        .whereHas("cashRegister", (query) => {
          return query.where("location_id", user.locationId!);
        })
        .where("status", "open")
        .first();

      if (!openSession) {
        return response.status(403).json({
          message:
            "Acción prohibida: Es necesario tener una sesión de caja abierta para realizar esta operación.",
        });
      }

      const cashRegisterSessionId = openSession?.id;
      query.where("cash_register_session_id", cashRegisterSessionId);
    }

    try {
      const orders = await Order.withCompanyFilter(companyId)
        .preload("waiter", (query) => query.select("id", "full_name"))
        .preload("table", (query) => query.select("id", "number"))
        .orderBy("created_at", "desc")
        .paginate(page, perPage);

      return response.ok(orders);
    } catch (error) {
      return response.internalServerError({
        message: "Ocurrió un error al obtener las órdenes.",
        error: error.message,
      });
    }
  }

  async store({
    request,
    response,
    auth,
    companyId,
    cashRegisterSessionId,
    cashRegisterBusinessDate,
    cashRecoveryIsActive,
    cashRecoveryAuthorizedUntil,
    locationId,
    cashTransactionTrx,
  }: HttpContext) {
    const trx = cashTransactionTrx || await db.transaction();

    try {
      const payload = await request.validateUsing(
        createOrderValidator(companyId, locationId!),
      );
      const {
        orderItems,
        paymentMethodId,
        notesPayment,
        adjustments = [],
        advancePayments = [],
        ...orderData
      } = payload;

      if (!cashRegisterSessionId) {
        return response.status(400).json({
          message: "No se encontró una sesión de caja activa",
        });
      }

      const orderCount = await Order.query({ client: trx })
        .where("cash_register_session_id", cashRegisterSessionId)
        .count("* as total");

      const nextOrderNumber = (orderCount[0].$extras.total as number) + 1;

      /* ===================================================== */
      /* CONSECUTIVO EMPRESARIAL */
      /* ===================================================== */

      const lastCompanyOrder = await Order.query({ client: trx })
        .where("company_id", companyId)
        .whereNotNull("company_order_number")
        .orderBy("company_order_number", "desc")
        .first();

      const nextCompanyOrderNumber = lastCompanyOrder
        ? lastCompanyOrder.companyOrderNumber + 1
        : 1;
      const finalOrderDataForOrder = {
        ...orderData,
        companyId,
        locationId,
        waiterId: auth.user!.id,
        cashRegisterSessionId,
        businessDate: businessDateValue(cashRegisterBusinessDate),
        orderNumber: nextOrderNumber.toString(),
        company_order_number: nextCompanyOrderNumber,
        subtotal: 0, // Se actualizará después
        totalAmount: 0, // Se actualizará después
        status: "pending" as const,
      };

      const order = await Order.create(finalOrderDataForOrder, { client: trx });

      // Si la orden es para comer en el sitio, marcar la mesa como ocupada
      if (order.orderType === "dine_in" && order.tableId) {
        await Table.query({ client: trx })
          .where("id", order.tableId)
          .update({ isBussy: true });
      }

      // ✅ PASO 1: Invalidar la caché de mesas AHORA que ha cambiado
      const namespaceKey = `tables:${companyId}`;
      const individualCacheKey = `table:${order.tableId}`;
      await cache.namespace(namespaceKey).clear(); // Limpia la lista paginada
      await cache.delete({ key: individualCacheKey }); // Limpia la mesa individual si está cacheada
      console.log(
        `-- CACHE CLEARED for tables namespace and table #${order.tableId} from OrdersController`,
      );

      await OrderStatusHistory.create(
        {
          orderId: order.id,
          previousStatus: null,
          newStatus: order.status,
          changedBy: auth.user!.id,
          reason: "Creación de la orden",
        },
        { client: trx },
      );

      const { success, totalAmount, subtotal } = await this.addOrderItems(
        orderItems,
        order.id,
        trx,
      );

      if (!success) {
        throw new Error("Error al procesar los items de la orden");
      }

      // Primero guardamos subtotal y total base de productos
      await order.merge({ subtotal, totalAmount }).save();

      // Luego aplicamos recargos/descuentos antes de registrar pagos
      if (adjustments.length > 0) {
        await OrderAdjustmentService.applyAdjustments(order, adjustments, trx);
        await order.load("adjustments");
      }

      // Volvemos a consultar la orden dentro de la transacción para obtener el total final ajustado
      const orderWithFinalTotals = await Order.query({ client: trx })
        .where("id", order.id)
        .firstOrFail();

      const finalTotalAmount = Number(
        orderWithFinalTotals.totalAmount || totalAmount,
      );

      if (payload.isAdvancePayment) {
        const paymentsToRegister =
          Array.isArray(advancePayments) && advancePayments.length > 0
            ? advancePayments
            : paymentMethodId
              ? [
                  {
                    paymentMethodId,
                    amount: finalTotalAmount,
                    notesPayment: notesPayment || "Pago anticipado completo",
                  },
                ]
              : [];

        if (paymentsToRegister.length === 0) {
          throw new Error(
            "No se recibieron datos de pago para el cobro anticipado",
          );
        }

        const totalReceived = paymentsToRegister.reduce((sum, payment) => {
          return sum.plus(Number(payment.amount || 0));
        }, new Decimal(0));

        const expectedTotal = new Decimal(finalTotalAmount);

        if (totalReceived.minus(expectedTotal).abs().greaterThan(0.0001)) {
          throw new Error(
            `El total recibido (${totalReceived.toNumber()}) no coincide con el total de la orden (${expectedTotal.toNumber()})`,
          );
        }

        for (const payment of paymentsToRegister) {
          const amount = Number(payment.amount || 0);

          if (!payment.paymentMethodId || amount <= 0) {
            throw new Error(
              "Uno de los pagos anticipados tiene datos inválidos",
            );
          }

          await this.addOrderPaymentOptimized(
            order.id,
            Number(payment.paymentMethodId),
            cashRegisterSessionId,
            auth.user!.id,
            amount,
            payment.notesPayment || notesPayment || "Pago anticipado",
            cashRegisterBusinessDate,
            trx,
          );

          await this.addCashMovementPayment(
            companyId,
            cashRegisterSessionId,
            order.id,
            auth.user!.id,
            amount,
            "sale",
            `Venta realizada en órdenes para órden ${order!.orderNumber}`,
            cashRegisterBusinessDate,
            trx,
          );
        }

        await order
          .merge({
            paidAt: DateTime.now(),
            paidBusinessDate: businessDateValue(cashRegisterBusinessDate),
            status: "paid" as const,
          })
          .save();

        await OrderStatusHistory.create(
          {
            orderId: order.id,
            previousStatus: "pending",
            newStatus: "paid",
            changedBy: auth.user!.id,
            reason: "Pago adelantado procesado",
          },
          { client: trx },
        );
      }

      await new CashRegisterOperatingService().logRecoveryActivity(
        {
          companyId,
          userId: auth.user!.id,
          cashRegisterSessionId,
          cashRegisterBusinessDate,
          cashRecoveryIsActive,
          cashRecoveryAuthorizedUntil,
          ipAddress: request.ip(),
          userAgent: request.header("user-agent"),
        },
        "cash_recovery_order_created",
        "order",
        order.id,
        { orderNumber: order.orderNumber },
        trx,
      );

      await trx.commit();

      // ✅ VALIDACIÓN: Solo emitir a cocina si la orden debe aparecer allí
      let shouldEmitToKitchen = false;

      if (!order.tableId) {
        // Orden para llevar - siempre se emite
        shouldEmitToKitchen = true;
      } else {
        // Orden con mesa - verificar si está ocupada
        const table = await Table.find(order.tableId);
        if (table && table.isBussy) {
          shouldEmitToKitchen = true;
        }
      }

      // Solo preparar y emitir si debe aparecer en cocina
      if (shouldEmitToKitchen) {
        // Preparamos la orden completa con todos sus detalles para enviarla a la cocina.
        const completedOrderToEmit = await Order.query()
          .where("id", order.id)
          .preload("orderItems", (itemQuery) => {
            itemQuery.preload("product", (p) => p.preload("category")); // Importante para que la cocina sepa el nombre del producto
          })
          .preload("waiter")
          .preload("table") // Para que sepan el número de mesa
          .preload("payments", (paymentQuery) => {
            paymentQuery.preload("paymentMethod", (paymentMethodQuery) => {
              paymentMethodQuery.select("id", "name", "type");
            });
          })
          .preload("adjustments")
          .firstOrFail();

        const roomName = `kitchen_room_${companyId}_${locationId}`;

        io.to(roomName).emit("new_order", completedOrderToEmit);
        io.to(roomName).emit("order_in_proccess", completedOrderToEmit);

        console.log(
          `📤 Evento 'new_order' emitido a la sala: ${roomName} para orden #${completedOrderToEmit.orderNumber}`,
        );

        // --> 2. AÑADE EL CÓDIGO PARA ENVIAR LA NOTIFICACIÓN PUSH <--
        if (locationId) {
          const title = `Nueva Comanda #${completedOrderToEmit.orderNumber}`;
          const body = "Un nuevo pedido ha llegado a la cocina.";

          // Llamamos al método que creaste en tu servicio
          // const firebaseService = new FirebaseService()
          await firebaseService.sendPushNotification(
            locationId,
            title,
            body,
            { orderId: order.id.toString() }, // Enviamos datos adicionales si es necesario
            ["kitchen"],
          );
        }
      } else {
        console.log(
          `🚫 Orden #${order.orderNumber} no emitida a cocina - mesa ${order.tableId} no está ocupada`,
        );
      }

      const completedOrder = await Order.query()
        .where("id", order.id)
        .preload("orderItems")
        .preload("waiter")
        .preload("payments", (paymentQuery) => {
          paymentQuery.preload("paymentMethod", (paymentMethodQuery) => {
            paymentMethodQuery.select("id", "name", "type");
          });
        })
        .preload("adjustments")
        .first();

      return response.created(completedOrder);
    } catch (error) {
      await trx.rollback();

      if (
        error.status === 422 ||
        error.code === "E_VALIDATION_ERROR" ||
        error.constructor.name === "ValidationError" ||
        (error.messages && Array.isArray(error.messages))
      ) {
        return response.status(422).json({
          message: "Los datos enviados no son válidos",
          errors: error.messages || error.errors || [],
        });
      }

      if (error.code && error.code.startsWith("ER_")) {
        return response.status(400).json({
          message: "Error en la base de datos",
          error: "Hay un problema con los datos proporcionados",
          context: error,
        });
      }

      console.error("Error creating order:", error);
      return response.internalServerError({
        message: "Ocurrió un error interno al crear la orden.",
        error: error.message,
      });
    }
  }

  /**
   * Muestra una orden específica
   */
  async show({ params, response, companyId }: HttpContext) {
    // ... (sin cambios en este método)
    try {
      const order = await Order.query()
        .where("id", params.id)
        .where("company_id", companyId)
        .preload("waiter")
        .preload("table")
        .preload("orderItems")
        .firstOrFail();

      return response.ok(order);
    } catch (error) {
      return response.notFound({
        message: `La orden con ID ${params.id} no fue encontrada.`,
      });
    }
  }

  async update({
    params,
    request,
    response,
    auth,
    companyId,
    locationId,
    cashRegisterSessionId,
    cashRegisterBusinessDate,
    cashRegisterIsPreviousBusinessDay,
    cashRecoveryIsActive,
    cashRecoveryAuthorizedUntil,
    cashTransactionTrx,
  }: HttpContext) {
    const MAX_RETRIES = cashTransactionTrx ? 1 : 3;
    const BASE_DELAY = 100; // milliseconds

    const payload = await request.validateUsing(
      updateOrderValidator(companyId, locationId!),
    );
    const { orderItems, paymentMethodId, notesPayment, ...orderData } = payload;

    const productIds = [...new Set(orderItems.map((item) => item.productId))];
    const products = await Product.query()
      .whereIn("id", productIds)
      .where("is_active", true)
      .exec();

    const productsMap = new Map(products.map((p) => [p.id, p]));
    for (const productId of productIds) {
      if (!productsMap.get(productId)) {
        return response.unprocessableEntity({
          message: `Producto con ID ${productId} no encontrado o no está disponible`,
        });
      }
    }

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      // const startTime = Date.now()
      let trx: any = null;

      try {
        trx = cashTransactionTrx || await db.transaction();

        const order = await Order.query({ client: trx })
          .where("id", params.id)
          .where("company_id", companyId)
          .where("location_id", locationId!)
          .forUpdate()
          .preload("orderItems", (query) => {
            query.preload("product", (p) => p.preload("category"));
          })
          .preload("waiter")
          .firstOrFail();

        if (
          cashRegisterIsPreviousBusinessDay &&
          order.cashRegisterSessionId !== cashRegisterSessionId
        ) {
          await trx.rollback();
          return response.conflict({
            message:
              "En modo recuperacion solo se pueden modificar comandas de la caja anterior activa.",
            code: "CASH_RECOVERY_ORDER_SESSION_MISMATCH",
          });
        }

        if (order.status === "cancelled") {
          await trx.rollback();
          return response.conflict({
            message: `No se puede modificar una orden que ya ha sido cancelada.`,
            code: "ORDER_CANCELLED",
          });
        }

        const isAdvancePaymentOrder = Boolean(
          order.isAdvancePayment || order.isPrepaid,
        );
        const hasLeftKitchen = Boolean(
          order.isReadyToServe ||
            order.isServed ||
            order.orderItems.some((item) =>
              ["ready", "served"].includes(item.kitchenStatus),
            ),
        );

        const currentQuantities = new Map<number, number>();
        order.orderItems.forEach((item) => {
          currentQuantities.set(
            item.productId,
            (currentQuantities.get(item.productId) || 0) +
              Number(item.quantity || 0),
          );
        });

        const requestedQuantities = new Map<number, number>();
        orderItems.forEach((item) => {
          requestedQuantities.set(
            item.productId,
            (requestedQuantities.get(item.productId) || 0) +
              Number(item.quantity || 0),
          );
        });

        if (order.status === "paid" && !isAdvancePaymentOrder) {
          await trx.rollback();
          return response.conflict({
            message: "No se puede modificar una orden regular ya pagada.",
            code: "ORDER_ALREADY_PAID",
          });
        }

        if (order.status === "paid" && isAdvancePaymentOrder && hasLeftKitchen) {
          await trx.rollback();
          return response.conflict({
            message:
              "No se puede modificar una orden con cobro anticipado que ya salio de cocina.",
            code: "PREPAID_ORDER_CLOSED",
          });
        }

        const isRegularAddOnlyEdit =
          !isAdvancePaymentOrder && order.status !== "paid" && hasLeftKitchen;

        let hasAdditionalItems = false;

        if (isRegularAddOnlyEdit) {
          for (const [productId, currentQuantity] of currentQuantities) {
            const requestedQuantity = requestedQuantities.get(productId) || 0;

            if (requestedQuantity < currentQuantity) {
              await trx.rollback();
              return response.conflict({
                message:
                  "No se pueden quitar productos ni reducir cantidades de una orden que ya salio de cocina.",
                code: "ORDER_ADD_ONLY",
              });
            }
          }

          for (const [productId, requestedQuantity] of requestedQuantities) {
            const currentQuantity = currentQuantities.get(productId) || 0;

            if (requestedQuantity > currentQuantity) {
              hasAdditionalItems = true;
              break;
            }
          }
        }

        // Variable para la respuesta final
        let financialChange = new Decimal(0);

        // --- LÓGICA DE PAGO SÓLO SI LA ORDEN ESTÁ PAGADA ---
        if (order.status === "paid") {
          let priceDelta = new Decimal(0);
          let hasFinancialChange = false;

          // Validaciones de estado para órdenes pagadas
          const protectedItems = new Map<
            number,
            { quantity: number; name: string }
          >();
          order.orderItems.forEach((item) => {
            if (
              item.kitchenStatus === "ready" ||
              item.kitchenStatus === "served"
            ) {
              const current = protectedItems.get(item.productId) || {
                quantity: 0,
                name: item.product.name,
              };
              protectedItems.set(item.productId, {
                quantity: current.quantity + item.quantity,
                name: current.name,
              });
            }
          });

          if (
            protectedItems.size === productsMap.size &&
            order.orderItems.length > 0
          ) {
            let allItemsProtected = true;
            for (const item of order.orderItems) {
              if (
                item.kitchenStatus !== "ready" &&
                item.kitchenStatus !== "served"
              ) {
                allItemsProtected = false;
                break;
              }
            }
            if (allItemsProtected) {
              await trx.rollback();
              return response.conflict({
                message: `Esta orden ya está completamente servida. Para agregar nuevos productos, debe crear una nueva orden.`,
                code: "ORDER_FULLY_SERVED",
              });
            }
          }

          const requestQuantities = new Map<number, number>();
          orderItems.forEach((item) => {
            const currentQty = requestQuantities.get(item.productId) || 0;
            requestQuantities.set(item.productId, currentQty + item.quantity);
          });

          for (const [productId, protectedItem] of protectedItems.entries()) {
            const requestQty = requestQuantities.get(productId) || 0;
            if (requestQty < protectedItem.quantity) {
              await trx.rollback();
              return response.conflict({
                message: `No se puede reducir la cantidad del producto "${protectedItem.name}" porque ya está listo o servido.`,
              });
            }
          }

          // Cálculo financiero robusto
          const initialTotalValue = order.orderItems.reduce(
            (sum, item) => sum.plus(item.totalPrice),
            new Decimal(0),
          );
          const finalTotalValue = orderItems.reduce((sum, item) => {
            const product = productsMap.get(item.productId)!;
            const unitPrice = product.getPriceAsDecimal();
            return sum.plus(unitPrice.times(item.quantity));
          }, new Decimal(0));

          priceDelta = finalTotalValue.minus(initialTotalValue);
          hasFinancialChange = !priceDelta.isZero();
          financialChange = priceDelta; // Guardar para la respuesta

          if (hasFinancialChange && !paymentMethodId) {
            await trx.rollback();
            return response.unprocessableEntity({
              message:
                "Se requiere un método de pago/reembolso para modificar los items de una orden ya pagada.",
              code: "PAYMENT_METHOD_REQUIRED",
              data: {
                changeAmount: priceDelta.toNumber(),
              },
            });
          }

          // Creación de registros de pago/reembolso
          if (hasFinancialChange && paymentMethodId) {
            if (priceDelta.greaterThan(0)) {
              await this.addOrderPaymentOptimized(
                order.id,
                paymentMethodId,
                order.cashRegisterSessionId,
                auth.user!.id,
                priceDelta.toNumber(),
                notesPayment,
                cashRegisterBusinessDate,
                trx,
              );
              await this.addCashMovementPayment(
                companyId,
                order.cashRegisterSessionId,
                order.id,
                auth.user!.id,
                priceDelta.toNumber(),
                "sale",
                `Pago adicional - Orden #${order.orderNumber}`,
                cashRegisterBusinessDate,
                trx,
              );
              await OrderStatusHistory.create(
                {
                  orderId: order.id,
                  previousStatus: "paid",
                  newStatus: "paid",
                  changedBy: auth.user!.id,
                  reason: "Pago adicional por modificación",
                },
                { client: trx },
              );
            } else if (priceDelta.lessThan(0)) {
              const refundAmount = priceDelta.abs();
              await this.addOrderPaymentOptimized(
                order.id,
                paymentMethodId,
                order.cashRegisterSessionId,
                auth.user!.id,
                priceDelta.toNumber(),
                notesPayment || "Reembolso por eliminación de producto",
                cashRegisterBusinessDate,
                trx,
              );
              await this.addCashMovementPayment(
                companyId,
                order.cashRegisterSessionId,
                order.id,
                auth.user!.id,
                refundAmount.toNumber(),
                "withdrawal",
                `Reembolso - Orden #${order.orderNumber}`,
                cashRegisterBusinessDate,
                trx,
              );
              await OrderStatusHistory.create(
                {
                  orderId: order.id,
                  previousStatus: "paid",
                  newStatus: "paid",
                  changedBy: auth.user!.id,
                  reason: "Reembolso por modificación de orden",
                },
                { client: trx },
              );
            }
          }
        }

        // --- ESTAS OPERACIONES SE EJECUTAN SIEMPRE (PARA ÓRDENES PAGADAS Y NO PAGADAS) ---

        // 1. Sincronizar los items de la orden
        await this.updateOrderItemsOptimized(
          order.id,
          orderItems,
          productsMap,
          trx,
        );

        // 2. Recalcular los totales de la orden
        const { success, totalAmount, subtotal } =
          await this.calculateOrderTotals(order.id, trx);
        if (!success)
          throw new Error("Error al calcular los totales de la orden");

        // 3. Preparar y guardar los datos actualizados de la orden
        const orderUpdateData = {
          ...orderData,
          subtotal,
          totalAmount,
          wasModified: true,
        };

        if (isRegularAddOnlyEdit && hasAdditionalItems) {
          Object.assign(orderUpdateData, {
            isReadyToServe: false,
            isServed: false,
            servedAt: null,
          });
        }

        await Order.query({ client: trx })
          .where("id", order.id)
          .update(orderUpdateData);

        await new CashRegisterOperatingService().logRecoveryActivity(
          {
            companyId,
            userId: auth.user!.id,
            cashRegisterSessionId,
            cashRegisterBusinessDate,
            cashRecoveryIsActive,
            cashRecoveryAuthorizedUntil,
            ipAddress: request.ip(),
            userAgent: request.header("user-agent"),
          },
          "cash_recovery_order_updated",
          "order",
          order.id,
          { orderNumber: order.orderNumber },
          trx,
        );

        await trx.commit();

        // --- Preparar la respuesta ---
        const updatedOrder = await Order.query()
          .where("id", order.id)
          .preload("orderItems", (query) =>
            query.preload("product", (p) => p.preload("category")),
          )
          .preload("waiter")
          .preload("payments", (paymentQuery) => {
            paymentQuery.preload("paymentMethod", (paymentMethodQuery) => {
              paymentMethodQuery.select("id", "name", "type");
            });
          })
          .preload("table")
          .preload("adjustments")
          .first();

        if (updatedOrder) {
          // Nos dirigimos a la sala de la compañía y la ubicación específica
          const roomName = `kitchen_room_${companyId}_${locationId}`;
          io.to(roomName).emit(
            "order_updated_for_kitchen",
            updatedOrder.serialize(),
          );
          // Llamamos al método que creaste en tu servicio
          // const firebaseService = new FirebaseService()
          if (locationId) {
            const title = `Se modificó la comanda #${updatedOrder.orderNumber}`;
            const body = "El pedido ha sido modificado.";

            await firebaseService.sendPushNotification(
              locationId,
              title,
              body,
              { orderId: updatedOrder.id.toString() }, // Enviamos datos adicionales si es necesario
              ["kitchen"],
            );
          }
        }

        let message = "Orden actualizada exitosamente";
        if (order.status === "paid") {
          if (financialChange.greaterThan(0)) {
            message = `Orden actualizada. Se procesó pago adicional de ${financialChange.toNumber()} por los nuevos items.`;
          } else if (financialChange.lessThan(0)) {
            message = `Orden actualizada. Se procesó un reembolso de ${financialChange.abs().toNumber()} por los items eliminados.`;
          }
        }

        return response.ok({
          order: updatedOrder,
          message: message,
          financialChange: financialChange.toNumber(),
        });
      } catch (error) {
        if (trx) await trx.rollback();
        // ... (resto del manejo de errores sin cambios)
        // const duration = Date.now() - startTime
        if (
          (error.message.includes("Lock wait timeout") ||
            error.message.includes("Deadlock found") ||
            error.code === "ER_LOCK_WAIT_TIMEOUT" ||
            error.code === "ER_LOCK_DEADLOCK") &&
          attempt < MAX_RETRIES
        ) {
          const jitter = Math.random() * 50;
          const delay = BASE_DELAY * Math.pow(2, attempt - 1) + jitter;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        if (
          error.message.includes("Lock wait timeout") ||
          error.message.includes("Deadlock found") ||
          error.code === "ER_LOCK_WAIT_TIMEOUT" ||
          error.code === "ER_LOCK_DEADLOCK"
        ) {
          return response.status(409).json({
            message:
              "La orden está siendo procesada por otro usuario. Por favor, intente nuevamente en unos momentos.",
            code: "CONCURRENT_MODIFICATION",
          });
        }
        console.error(
          `[ORDER_UPDATE] Error en orden ${params.id}:`,
          error.message,
        );
        if (
          error.status === 422 ||
          error.code === "E_VALIDATION_ERROR" ||
          error.constructor.name === "ValidationError"
        ) {
          return response.status(422).json({
            message: "Los datos enviados no son válidos",
            errors: error.messages || [],
          });
        }
        if (error.code === "E_ROW_NOT_FOUND") {
          return response.notFound({
            message: "La orden no fue encontrada o no pertenece a tu compañía.",
          });
        }
        return response.internalServerError({
          message: "Ocurrió un error al actualizar la orden.",
          error: error.message,
        });
      }
    }
    return response.internalServerError({
      message:
        "Error inesperado al actualizar la orden después de múltiples intentos.",
    });
  }

  async cancelOrder({
    params,
    request,
    response,
    companyId,
    auth,
    locationId,
    cashRegisterSessionId,
    cashRegisterBusinessDate,
    cashRegisterIsPreviousBusinessDay,
    cashRecoveryIsActive,
    cashRecoveryAuthorizedUntil,
    cashTransactionTrx,
  }: HttpContext) {
    const trx = cashTransactionTrx || await db.transaction();
    try {
      const payload = await request.validateUsing(
        cancelOrderValidator(companyId),
      );

      const order = await Order.query({ client: trx })
        .where("id", params.id)
        .where("company_id", companyId)
        .where("location_id", locationId!)
        .preload("payments") // Cargar los pagos existentes
        .preload("orderItems", (query) =>
          query.preload("product", (productQuery) =>
            productQuery.preload("category"),
          ),
        )
        .preload("waiter")
        .firstOrFail();

      if (
        cashRegisterIsPreviousBusinessDay &&
        order.cashRegisterSessionId !== cashRegisterSessionId
      ) {
        await trx.rollback();
        return response.conflict({
          message:
            "En modo recuperacion solo se pueden cancelar comandas de la caja anterior activa.",
          code: "CASH_RECOVERY_ORDER_SESSION_MISMATCH",
        });
      }

      if (order.status === "cancelled") {
        await trx.rollback();
        return response.conflict({
          message: "Esta orden ya ha sido cancelada previamente.",
        });
      }

      const amountAlreadyPaid = order.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Decimal(0),
      );

      const hasLeftKitchen = Boolean(
        order.isReadyToServe ||
          order.isServed ||
          order.orderItems.some((item) =>
            ["ready", "served"].includes(item.kitchenStatus),
          ),
      );

      if (amountAlreadyPaid.isZero() && hasLeftKitchen) {
        await trx.rollback();
        return response.conflict({
          message:
            "No se puede cancelar una comanda con productos que ya salieron de cocina.",
          code: "ORDER_CANCELLATION_CLOSED",
        });
      }

      let currentUserRoleCode: string | null = null;

      try {
        await auth.user!.load("role");
        currentUserRoleCode = auth.user!.role?.code || null;
      } catch {
        currentUserRoleCode = null;
      }

      const canManagePaidRefund = ["super_admin", "admin"].includes(
        currentUserRoleCode || "",
      );

      const requiresAdminForServedPaidRefund =
        amountAlreadyPaid.greaterThan(0) && order.isServed === true;

      if (requiresAdminForServedPaidRefund && !canManagePaidRefund) {
        await trx.rollback();

        return response.status(403).json({
          message:
            "No tienes permisos para gestionar devoluciones de órdenes ya pagadas.",
        });
      }

      // Si hubo pagos, se debe procesar un reembolso
      if (amountAlreadyPaid.greaterThan(0)) {
        if (!payload.paymentMethodId) {
          await trx.rollback();
          return response.badRequest({
            message:
              "Se requiere un método de pago para reembolsar una orden pagada.",
          });
        }

        // Crear un OrderPayment negativo para el reembolso total
        await this.addOrderPaymentOptimized(
          order.id,
          payload.paymentMethodId,
          order.cashRegisterSessionId,
          auth.user!.id,
          amountAlreadyPaid.negated().toNumber(), // <- Monto negativo
          payload.reason || "Reembolso por cancelación de orden",
          cashRegisterBusinessDate,
          trx,
        );

        // Crear un movimiento de caja de tipo "withdrawal"
        await this.addCashMovementPayment(
          companyId,
          order.cashRegisterSessionId,
          order.id,
          auth.user!.id,
          amountAlreadyPaid.toNumber(), // <- Monto positivo
          "withdrawal",
          `Reembolso por cancelación - Orden #${order.orderNumber}`,
          cashRegisterBusinessDate,
          trx,
        );
      }

      // Actualizar el estado de la orden a "cancelada"
      order.status = "cancelled";
      order.cancelledAt = DateTime.now();
      order.cancelledBusinessDate = businessDateValue(
        cashRegisterBusinessDate,
      );
      await order.save();

      // --- AÑADIR ESTA LÍNEA AQUÍ ---
      // Actualizar el estado de todos los items de la orden a 'pending'
      await OrderItem.query({ client: trx })
        .where("order_id", order.id)
        .update({ kitchenStatus: "pending" });

      // Registrar en el historial
      await OrderStatusHistory.create(
        {
          orderId: order.id,
          previousStatus: order.status,
          newStatus: "cancelled",
          changedBy: auth.user!.id,
          reason: payload.reason || "Orden cancelada por el usuario",
        },
        { client: trx },
      );

      // Verificar si la mesa debe ser desocupada
      if (order.orderType === "dine_in" && order.tableId) {
        await this.updateTableStatus(order.tableId, trx);
      }

      await new CashRegisterOperatingService().logRecoveryActivity(
        {
          companyId,
          userId: auth.user!.id,
          cashRegisterSessionId,
          cashRegisterBusinessDate,
          cashRecoveryIsActive,
          cashRecoveryAuthorizedUntil,
          ipAddress: request.ip(),
          userAgent: request.header("user-agent"),
        },
        "cash_recovery_order_cancelled",
        "order",
        order.id,
        { orderNumber: order.orderNumber },
        trx,
      );

      await trx.commit();

      const roomName = `kitchen_room_${companyId}_${locationId}`;
      io.to(roomName).emit("order_is_cancelled", order);
      // --> 2. AÑADE EL CÓDIGO PARA ENVIAR LA NOTIFICACIÓN PUSH <--
      if (locationId) {
        const title = `Pedido #${order.orderNumber} ha sido cancelado`;
        const body = "Pedido cancelado.";

        // Llamamos al método que creaste en tu servicio
        // const firebaseService = new FirebaseService()
        await firebaseService.sendPushNotification(
          locationId,
          title,
          body,
          { orderId: order.id.toString() }, // Enviamos datos adicionales si es necesario
          ["kitchen"],
        );
      }

      return response.ok({
        message: "La orden ha sido cancelada exitosamente.",
        refundProcessed: amountAlreadyPaid.greaterThan(0),
        refundAmount: amountAlreadyPaid.toNumber(),
        order,
      });
    } catch (error) {
      await trx.rollback();
      if (error.code === "E_ROW_NOT_FOUND") {
        return response.notFound({
          message: `La orden con ID ${params.id} no fue encontrada.`,
        });
      }
      return response.internalServerError({
        message: "Ocurrió un error al cancelar la orden.",
        error: error.message,
      });
    }
  }

  /**
   * REEMPLAZA TU FUNCIÓN ANTERIOR CON ESTA
   * * Versión mejorada que sincroniza los items de la orden de forma inteligente,
   * preservando el estado de los productos ya listos o servidos.
   */
  async updateOrderItemsOptimized(
    orderId: number,
    newOrderItems: Array<{ productId: number; quantity: number }>,
    productsMap: Map<number, Product>,
    trx: any,
  ): Promise<void> {
    // 1. Obtener el estado actual de los items de la base de datos
    const currentItems = await OrderItem.query({ client: trx }).where(
      "order_id",
      orderId,
    );

    // 2. Mapear los items que NO se deben tocar (listos o servidos)
    const preservedItemsMap = new Map<number, any>();
    currentItems.forEach((item) => {
      if (item.kitchenStatus === "ready" || item.kitchenStatus === "served") {
        const current = preservedItemsMap.get(item.productId);

        if (current) {
          preservedItemsMap.set(item.productId, {
            ...current,
            quantity: current.quantity + Number(item.quantity || 0),
            totalPrice:
              Number(current.totalPrice || 0) + Number(item.totalPrice || 0),
            kitchenStatus:
              current.kitchenStatus === "served" ||
              item.kitchenStatus === "served"
                ? "served"
                : "ready",
          });
          return;
        }

        preservedItemsMap.set(item.productId, {
          productId: item.productId,
          quantity: Number(item.quantity || 0),
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          kitchenStatus: item.kitchenStatus,
          kitchenStartedAt: item.kitchenStartedAt,
          kitchenReadyAt: item.kitchenReadyAt,
          specialInstructions: item.specialInstructions,
        });
      }
    });

    const itemsToInsert = [];

    // 3. Procesar la lista de items que llega en la petición
    for (const itemData of newOrderItems) {
      const product = productsMap.get(itemData.productId)!;
      const unitPrice = product.getPriceAsDecimal();
      const preservedItem = preservedItemsMap.get(itemData.productId);

      // CASO A: El producto ya existía y estaba servido/listo
      if (preservedItem) {
        // A.1. Mantener la línea del producto que ya estaba servido/listo
        itemsToInsert.push({
          order_id: orderId,
          product_id: preservedItem.productId,
          quantity: preservedItem.quantity,
          unit_price: preservedItem.unitPrice,
          total_price: preservedItem.totalPrice,
          kitchen_status: preservedItem.kitchenStatus, // <- Se mantiene el estado!
          kitchen_started_at: preservedItem.kitchenStartedAt,
          special_instructions: preservedItem.specialInstructions,
        });

        // A.2. Si la nueva cantidad es mayor, crear una línea NUEVA para la diferencia
        const additionalQuantity = itemData.quantity - preservedItem.quantity;
        if (additionalQuantity > 0) {
          itemsToInsert.push({
            order_id: orderId,
            product_id: itemData.productId,
            quantity: additionalQuantity,
            unit_price: product.price,
            total_price: unitPrice.times(additionalQuantity).toNumber(),
            kitchen_status: "in_preparation", // <- El nuevo va a preparación
            kitchen_started_at: DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"),
            special_instructions: null, // Asumimos que no hay instrucciones para la adición
          });
        }
      }
      // CASO B: Es un producto nuevo o uno que aún estaba en preparación
      else {
        itemsToInsert.push({
          order_id: orderId,
          product_id: itemData.productId,
          quantity: itemData.quantity,
          unit_price: product.price,
          total_price: unitPrice.times(itemData.quantity).toNumber(),
          kitchen_status: "in_preparation", // <- Estado por defecto
          kitchen_started_at: DateTime.now().toFormat("yyyy-MM-dd HH:mm:ss"),
          special_instructions: null,
        });
      }
    }

    // 4. Borrar TODOS los items viejos para reemplazarlos con la nueva lista procesada
    await OrderItem.query({ client: trx }).where("order_id", orderId).delete();

    // 5. Insertar la nueva lista de items, que ahora respeta los estados anteriores
    if (itemsToInsert.length > 0) {
      // Usamos el query builder de Lucid para asegurar el formato correcto de fechas
      await OrderItem.createMany(itemsToInsert, { client: trx });
    }
  }

  /**
   * Versión optimizada de addOrderPayment que solo crea el pago adicional
   */
  async addOrderPaymentOptimized(
    orderId: number,
    paymentMethodId: number,
    cashRegisterSessionId: number,
    userId: number,
    additionalAmount: number,
    notes?: string,
    businessDateOrTrx?: string | any,
    maybeTrx?: any,
  ): Promise<{ successPayment: boolean }> {
    try {
      const businessDate =
        typeof businessDateOrTrx === "string" ? businessDateOrTrx : undefined;
      const trx = businessDate ? maybeTrx : businessDateOrTrx;
      const effectiveBusinessDate =
        businessDateValue(businessDate) ||
        (await this.getSessionBusinessDate(cashRegisterSessionId, trx));
      await OrderPayment.create(
        {
          orderId,
          paymentMethodId,
          cashRegisterSessionId,
          businessDate: effectiveBusinessDate,
          amount: additionalAmount, // Solo el monto adicional, no recalcular todo
          processedBy: userId,
          processedAt: DateTime.now(),
          notes: notes || "Pago adicional por modificación de orden",
        },
        { client: trx },
      );

      return { successPayment: true };
    } catch (error) {
      throw error;
    }
  }

  /**
   * MÉTODO HELPER: Actualizar items de la orden
   */
  async updateOrderItems(
    order: Order,
    newOrderItems: Array<{ productId: number; quantity: number }>,
    trx: any,
  ): Promise<void> {
    // Eliminar todos los items actuales de la orden
    await OrderItem.query({ client: trx }).where("order_id", order.id).delete();

    // Crear los nuevos items
    for (const itemData of newOrderItems) {
      const product = await Product.findOrFail(itemData.productId);

      if (!product.isActive) {
        throw new Error(`Producto "${product.name}" no está disponible`);
      }

      // Obtener el precio del producto y calcular el total
      const unitPrice = product.getPriceAsDecimal();
      const itemTotalPrice = unitPrice.times(itemData.quantity);

      await OrderItem.create(
        {
          orderId: order.id,
          productId: itemData.productId,
          quantity: itemData.quantity,
          unitPrice: product.price, // Guardamos el precio del producto en ese momento
          totalPrice: itemTotalPrice.toNumber(),
          kitchenStatus: "in_preparation",
          kitchenStartedAt: DateTime.now(),
          specialInstructions: null,
        },
        { client: trx },
      );
    }
  }

  /**
   * MÉTODO HELPER: Calcular totales de la orden
   */
  async calculateOrderTotals(
    orderId: number,
    trx: any,
  ): Promise<{ success: boolean; totalAmount: number; subtotal: number }> {
    try {
      const orderItems = await OrderItem.query({ client: trx })
        .where("order_id", orderId)
        .exec();

      let subtotal = new Decimal(0);

      for (const item of orderItems) {
        subtotal = subtotal.plus(item.getTotalPriceAsDecimal());
      }

      const adjustments = await OrderAdjustment.query({ client: trx })
        .where("order_id", orderId)
        .exec();

      const totalAmount = adjustments.reduce((total, adjustment) => {
        const amount = new Decimal(adjustment.amount || 0);
        return adjustment.type === "discount"
          ? total.minus(amount)
          : total.plus(amount);
      }, subtotal);

      return {
        success: true,
        totalAmount: totalAmount.toNumber(),
        subtotal: subtotal.toNumber(),
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Elimina (cancela) una orden.
   */
  async destroy({ params, response, companyId }: HttpContext) {
    // ... (sin cambios en este método)
    try {
      const order = await Order.query()
        .where("id", params.id)
        .where("company_id", companyId)
        .firstOrFail();

      if (order.status === "paid") {
        return response.conflict({
          message: "No se puede cancelar una orden ya pagada.",
        });
      }

      order.status = "cancelled";
      order.cancelledAt = DateTime.now();
      await order.save();

      return response.ok({
        message: "La orden ha sido cancelada exitosamente.",
        order,
      });
    } catch (error) {
      if (error.code === "E_ROW_NOT_FOUND") {
        return response.notFound({
          message: `La orden con ID ${params.id} no fue encontrada.`,
        });
      }
      return response.internalServerError({
        message: "Ocurrió un error al cancelar la orden.",
        error: error.message,
      });
    }
  }

  /**
   * MÉTODO HELPER ACTUALIZADO
   */
  async addOrderItems(
    listOrderItems: Array<{ productId: number; quantity: number }>,
    orderId: number,
    trx?: any,
  ): Promise<{ success: boolean; totalAmount: number; subtotal: number }> {
    // MODIFICADO: Inicializar subtotal como un objeto Decimal.
    let subtotal = new Decimal(0);

    try {
      for (const itemToAdd of listOrderItems) {
        const productData = await Product.find(itemToAdd.productId);

        if (!productData) {
          throw new Error(
            `Producto con ID ${itemToAdd.productId} no encontrado`,
          );
        }

        if (!productData.isActive) {
          throw new Error(`Producto "${productData.name}" no está disponible`);
        }

        // MODIFICADO: Usar el método del modelo para obtener el precio como Decimal.
        const unitPriceDecimal = productData.getPriceAsDecimal();
        // MODIFICADO: Calcular el precio total del item usando los métodos de Decimal.js.
        const itemTotalPriceDecimal = unitPriceDecimal.times(
          itemToAdd.quantity,
        );

        // MODIFICADO: Acumular el subtotal usando .plus() para mantener la precisión.
        subtotal = subtotal.plus(itemTotalPriceDecimal);

        await OrderItem.create(
          {
            orderId,
            productId: itemToAdd.productId,
            quantity: itemToAdd.quantity,
            // Guardamos el precio unitario del producto en ese momento.
            unitPrice: productData.price,
            // MODIFICADO: Convertimos el total del item a número para guardarlo en la BD.
            totalPrice: itemTotalPriceDecimal.toNumber(),
            kitchenStatus: "in_preparation",
            kitchenStartedAt: DateTime.now(),

            specialInstructions: null,
          },
          trx ? { client: trx } : {},
        );
      }

      // MODIFICADO: El total por ahora es igual al subtotal.
      // Si hubiera impuestos o descuentos, se calcularían aquí usando Decimal.js.
      let totalAmount = subtotal;

      // Ejemplo con impuesto del 19%:
      // const taxRate = new Decimal(0.19);
      // const taxes = subtotal.times(taxRate);
      // totalAmount = subtotal.plus(taxes);

      return {
        success: true,
        // MODIFICADO: Convertir los totales a número antes de retornarlos.
        totalAmount: totalAmount.toNumber(),
        subtotal: subtotal.toNumber(),
      };
    } catch (error) {
      // Dejar que la transacción principal maneje el rollback
      throw error;
    }
  }

  async addOrderPayment(
    orderId: number,
    paymentMethodId: number,
    cashRegisterSessionId: number,
    userId: number,
    notes?: string,
    businessDateOrTrx?: string | any,
    maybeTrx?: any,
  ): Promise<{ successPayment: boolean; totalAmountPayed: number }> {
    let totalAmount = new Decimal(0);

    try {
      const businessDate =
        typeof businessDateOrTrx === "string" ? businessDateOrTrx : undefined;
      const trx = businessDate ? maybeTrx : businessDateOrTrx;
      const effectiveBusinessDate =
        businessDateValue(businessDate) ||
        (await this.getSessionBusinessDate(cashRegisterSessionId, trx));
      // CORRECCIÓN: Usar la transacción si está disponible
      const query = OrderItem.query().where("order_id", orderId);
      if (trx) {
        query.useTransaction(trx);
      }

      const productsToPay = await query.exec();

      for (const itemToCalculate of productsToPay) {
        totalAmount = totalAmount.plus(
          itemToCalculate.getTotalPriceAsDecimal(),
        );
      }

      await OrderPayment.create(
        {
          orderId,
          paymentMethodId,
          cashRegisterSessionId,
          businessDate: effectiveBusinessDate,
          amount: totalAmount.toNumber(),
          processedBy: userId,
          processedAt: DateTime.now(),
          notes,
        },
        trx ? { client: trx } : {},
      );

      return {
        successPayment: true,
        totalAmountPayed: totalAmount.toNumber(),
      };
    } catch (error) {
      // Dejar que la transacción principal maneje el rollback
      throw error;
    }
  }

  /**
   * Agrega registro en el movimiento de caja
   * @param companyId
   * @param cashRegisterSessionId
   * @param orderId
   * @param userId
   * @param amount
   * @param movementType
   * @param notes
   * @param trx
   * @returns
   */
  async addCashMovementPayment(
    companyId: number,
    cashRegisterSessionId: number,
    orderId: number,
    userId: number,
    amount: number,
    movementType?: "sale" | "withdrawal" | "deposit",
    notes?: string,
    businessDateOrTrx?: string | any,
    maybeTrx?: any,
  ): Promise<{
    successPaymentCashMovement: boolean;
    totalAmountPayed: number;
  }> {
    try {
      const businessDate =
        typeof businessDateOrTrx === "string" ? businessDateOrTrx : undefined;
      const trx = businessDate ? maybeTrx : businessDateOrTrx;
      const effectiveBusinessDate =
        businessDateValue(businessDate) ||
        (await this.getSessionBusinessDate(cashRegisterSessionId, trx));
      await CashMovement.create(
        {
          companyId,
          cashRegisterSessionId,
          businessDate: effectiveBusinessDate,
          orderId,
          userId,
          movementType,
          notes,
          amount,
        },
        trx ? { client: trx } : {},
      );

      return {
        successPaymentCashMovement: true,
        totalAmountPayed: amount,
      };
    } catch (error) {
      // Dejar que la transacción principal maneje el rollback
      throw error;
    }
  }

  private async getSessionBusinessDate(
    cashRegisterSessionId: number,
    trx?: any,
  ): Promise<DateTime | undefined> {
    const session = await CashRegisterSession.query(
      trx ? { client: trx } : undefined,
    )
      .where("id", cashRegisterSessionId)
      .first();

    return session?.businessDate || undefined;
  }

  /**
   * Verifica si una mesa tiene otras órdenes activas. Si no las tiene,
   * la marca como desocupada.
   */
  public async updateTableStatus(tableId: number, trx: any) {
    // Contar cuántas OTRAS órdenes activas hay en la misma mesa
    const activeOrdersCount = await Order.query({ client: trx })
      .where("table_id", tableId)
      .whereNotIn("status", ["paid", "cancelled"])
      .count("* as total");

    // Si no hay otras órdenes activas, la mesa se desocupa
    if (Number(activeOrdersCount[0].$extras.total) === 0) {
      await Table.query({ client: trx })
        .where("id", tableId)
        .update({ isBussy: false });
    }
  }

  /**
   * Devuelve una lista de órdenes pendientes para la cocina de una sucursal específica.
   * Una orden se considera pendiente si tiene al menos un item en estado 'in_preparation'.
   */
  async getPendingFotKitchen({
    response,
    companyId,
    locationId,
    cashRegisterSessionId,
  }: HttpContext) {
    if (!locationId) {
      return response.badRequest({
        message:
          "El ID de la sucursal es requerido para consultar las órdenes de cocina.",
      });
    }

    try {
      const pendingOrders = await Order.withCompanyFilter(companyId)
        // Aplica el filtro para la compañía actual
        // Filtra por la sucursal actual
        .where("location_id", locationId)
        .where("cash_register_session_id", cashRegisterSessionId!)
        .whereNotIn("status", ["cancelled"])
        // La magia está aquí: whereHas asegura que la orden tenga al menos un
        // item que cumpla la condición del sub-query.
        .whereHas("orderItems", (query: any) => {
          query
            .where("kitchen_status", "in_preparation")
            .orWhere("kitchen_status", "pending");
        })
        .where((mainQuery: any) => {
          mainQuery
            // Caso 1: Órdenes SIN mesa (tableId es null) - las incluimos siempre
            .whereNull("table_id")
            // Caso 2: Órdenes CON mesa - solo si la mesa está ocupada (isBusy = true)
            .orWhereHas("table", (tableQuery: any) => {
              tableQuery.where("is_bussy", true);
            });
        })
        // Precargamos las relaciones que el frontend necesita para mostrar la orden completa
        .preload("orderItems", (itemQuery: any) => {
          // A su vez, precargamos el producto de cada item para saber su nombre
          itemQuery
            .preload("product", (subQuery: any) => {
              return subQuery
                .select("id", "name", "preparationTime", "categoryId")
                .preload("category");
            })
            .select(
              "id",
              "orderId",
              "productId",
              "quantity",
              "kitchenStatus",
              "kitchenStartedAt",
              "kitchenReadyAt",
              "createdAt",
            );
        })
        .preload("waiter")
        .preload("table")
        .select(
          "id",
          "companyId",
          "cashRegisterSessionId",
          "locationId",
          "tableId",
          "waiterId",
          "orderNumber",
          "customerName",
          "kitchenNotes",
          "orderType",
          "servedAt",
          "cancelledAt",
          "createdAt",
          "updatedAt",
          "isReadyToServe",
          "isServed",
          "wasModified",
        )
        .orderBy("created_at", "asc"); // Mostramos las órdenes más antiguas primero

      return response.ok(pendingOrders);
    } catch (error) {
      console.error("Error fetching pending kitchen orders:", error);
      return response.internalServerError({
        message: "Ocurrió un error al obtener las órdenes para la cocina.",
        error: error.message,
      });
    }
  }

  /**
   * Devuelve una lista de órdenes activas para la vista del mesero.
   * Una orden se considera activa si está 'in_preparation', 'ready' o 'served'.
   */
  public async getActiveForWaiter({
    response,
    companyId,
    locationId,
    cashRegisterSessionId,
  }: HttpContext) {
    // Validamos que tengamos los IDs necesarios para filtrar correctamente
    if (!locationId || !cashRegisterSessionId) {
      return response.badRequest({
        message: "La sucursal y la sesión de caja son requeridas.",
      });
    }

    try {
      // Definimos los estados que consideramos "activos" para un mesero.
      const activeStatuses = ["in_preparation", "ready", "served", "pending"];

      const activeOrders = await Order.query()
        .where("company_id", companyId) // Filtro multitenant
        .where("location_id", locationId)
        .where("cash_register_session_id", cashRegisterSessionId)
        .whereHas("orderItems", (query) => {
          return query.whereIn("kitchenStatus", activeStatuses);
        })
        .preload("orderItems", (query) => {
          query.preload("product", (queryProduct: any) => {
            return queryProduct.preload("category");
          }); // Precargamos los productos para saber sus nombres
        })
        .preload("waiter")
        .preload("table")
        .preload("payments", (query) => {
          query.preload("paymentMethod", (paymentMethodQuery) => {
            paymentMethodQuery.select("id", "name", "type");
          });
        })
        .preload("adjustments")
        .orderBy("created_at", "asc");

      return response.ok(activeOrders);
    } catch (error) {
      console.error("Error fetching active waiter orders:", error);
      return response.internalServerError({
        message: "Ocurrió un error al obtener las órdenes activas.",
      });
    }
  }

  /**
   * Función para marcar la órden como lista
   * @param param0
   * @returns
   */
  public async markAsReady({
    params,
    response,
    companyId,
    locationId,
  }: HttpContext) {
    const trx = await db.transaction();
    try {
      const order = await Order.query({ client: trx })
        .where("company_id", companyId)
        .where("id", params.id)
        .preload("waiter")
        .preload("orderItems") // Precargamos los items para las validaciones
        .first();

      // Si la orden no existe, arrojar un error 404
      if (!order) {
        return response.notFound({
          message: `La orden con ID #${params.id} no fue encontrada.`,
        });
      }

      const { orderItems } = order;

      // 3. VALIDACIÓN: Verificar si todos los items ya están listos
      const areAllItemsReady = orderItems.every(
        (item) =>
          item.kitchenStatus === "ready" || item.kitchenStatus === "served",
      );
      if (areAllItemsReady) {
        // Usamos el código 409 (Conflict) porque la acción no se puede realizar
        // debido al estado actual del recurso.
        return response.conflict({
          message: `La orden #${order.id} ya tiene todos sus items listos.`,
        });
      }

      // 4. VALIDACIÓN: Verificar si algún item ya fue servido
      const isAnyItemServed = orderItems.some(
        (item) => item.kitchenStatus === "served",
      );
      if (
        isAnyItemServed &&
        orderItems.every((item) => item.kitchenStatus === "served")
      ) {
        return response.conflict({
          message: `La orden #${order.id} no se puede modificar porque ya ha sido servida.`,
        });
      }

      // 5. ACTUALIZACIÓN: Cambiar el estado de los items y de la orden

      // Filtramos los IDs de los items que están 'in_preparation' para actualizarlos
      const itemsToUpdateIds = orderItems
        .filter(
          (item) =>
            item.kitchenStatus === "in_preparation" ||
            item.kitchenStatus === "pending",
        )
        .map((item) => item.id);

      // Si no hay items para actualizar, no tiene sentido continuar
      if (itemsToUpdateIds.length === 0) {
        return response.conflict({
          message: `La orden #${order.id} no tiene items pendientes o en preparación para marcar como listos.`,
        });
      }

      // Actualizar solo los items necesarios
      await OrderItem.query({ client: trx })
        .whereIn("id", itemsToUpdateIds)
        .update({ kitchen_status: "ready" });

      // Actualizar la orden principal
      order.useTransaction(trx); // Asegurarse de que esta instancia de orden use la transacción
      // order.status = 'ready' // NO ACTUALIZAR EL ESTADO DE LA ORDEN, SOLO EL DE LOS HIJOS
      order.isReadyToServe = true; // Como solicitaste
      await order.save();

      // 6. Si todo salió bien, confirmar la transacción
      await trx.commit();

      // 7. Preparar y emitir el evento de socket con los datos actualizados
      const updatedOrderToEmit = await Order.query()
        .where("id", order.id)
        .preload("orderItems", (q) =>
          q.preload("product", (p) => p.preload("category")),
        )
        .preload("waiter")
        .preload("table")
        .firstOrFail();

      const roomName = `kitchen_room_${companyId}_${locationId}`;
      io.to(roomName).emit("order_is_ready", updatedOrderToEmit);
      io.to(roomName).emit(`order_removed`, updatedOrderToEmit.id);

      // --> 2. AÑADE EL CÓDIGO PARA ENVIAR LA NOTIFICACIÓN PUSH <--
      if (locationId) {
        const title = `Pedido #${order.orderNumber} listo para servir`;
        const body = "Pedido listo para servir.";

        // Llamamos al método que creaste en tu servicio
        // const firebaseService = new FirebaseService()
        await firebaseService.sendPushNotification(
          locationId,
          title,
          body,
          { orderId: order.id.toString() }, // Enviamos datos adicionales si es necesario
          ["waiter"],
        );
      }

      console.log(
        `📡 Evento 'order_is_ready', 'order_removed' emitido para la orden #${order.id}`,
      );

      return response.ok(updatedOrderToEmit);
    } catch (error) {
      // Si algo falla, revertir todos los cambios en la base de datos
      await trx.rollback();
      console.error("Error al marcar la orden como lista:", error);
      return response.internalServerError({
        message: "Ocurrió un error interno al procesar la solicitud.",
        error: error.message,
      });
    }
  }

  public async markAsServed({
    params,
    response,
    companyId,
    locationId,
  }: HttpContext) {
    const trx = await db.transaction();
    try {
      const order = await Order.query({ client: trx })
        .where("company_id", companyId)
        .where("id", params.id)
        .preload("waiter")
        .preload("orderItems", (q) =>
          q.preload("product", (p) => p.preload("category")),
        )
        .first();

      if (!order) {
        return response.notFound({
          message: `La orden con ID #${params.id} no fue encontrada.`,
        });
      }

      const { orderItems } = order;

      // Validar si ya fue servida
      const isOrderAlreadyServed = orderItems.every(
        (item) => item.kitchenStatus === "served",
      );
      if (isOrderAlreadyServed) {
        return response.conflict({
          message: `La orden #${order.id} ya fue servida.`,
        });
      }

      // Validar si todos están listos
      const areAllItemsReady = orderItems.every(
        (item) =>
          item.kitchenStatus === "ready" || item.kitchenStatus === "served",
      );
      if (!areAllItemsReady) {
        return response.conflict({
          message: `La orden #${order.id} no puede servirse porque aún hay items en preparación.`,
        });
      }

      // Actualizar items -> de ready a served
      await OrderItem.query({ client: trx })
        .where("order_id", order.id)
        .update({ kitchen_status: "served" });

      // Actualizar orden principal
      order.useTransaction(trx);
      order.servedAt = DateTime.now();
      order.isServed = true; // asegúrate que exista esta columna en el schema
      await order.save();

      await trx.commit();

      // Emitir al socket la orden actualizada
      const updatedOrderToEmit = await Order.query()
        .where("id", order.id)
        .preload("orderItems", (q) =>
          q.preload("product", (p) => p.preload("category")),
        )
        .preload("waiter")
        .preload("table")
        .firstOrFail();

      const roomName = `kitchen_room_${companyId}_${locationId}`;
      io.to(roomName).emit("order_is_served", updatedOrderToEmit);

      console.log(
        `📡 Evento 'order_is_served' emitido para la orden #${order.id}`,
      );

      return response.ok(updatedOrderToEmit);
    } catch (error) {
      await trx.rollback();
      console.error("Error al marcar la orden como servida:", error);
      return response.internalServerError({
        message: "Ocurrió un error interno al procesar la solicitud.",
        error: error.message,
      });
    }
  }
}
