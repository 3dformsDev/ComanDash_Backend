import CashMovement from "#models/cash_movement";
import Order from "#models/order";
import OrderPayment from "#models/order_payment";
import { createOrderPaymentValidator } from "#validators/order_payment";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { Decimal } from "decimal.js"; // NUEVO: Importar Decimal.js
import { DateTime } from "luxon";
import OrderStatusHistory from "#models/order_status_history";
import OrdersController from "./orders_controller.js";
import { io } from "#start/socket";
import OrderAdjustmentService from "#services/orders/order_adjustment_service";

export default class OrderPaymentsController {
  /**
   * Display a list of resource
   */
  async index({ request, response, companyId, getQueryData }: HttpContext) {
    const { page = 1, perPage = 10 } = getQueryData();

    const qs = request.qs();
    const orderId = qs.order_id ? qs.order_id : null;
    const paymentMethodId = qs.payment_method_id ? qs.payment_method_id : null;
    const cashRegisterId = qs.cash_register_id ? qs.cash_register_id : null;
    const locationId = qs.location_id ? qs.location_id : null;

    let query = OrderPayment.query().whereHas("order", (orderQuery) => {
      orderQuery.where("company_id", companyId);
    });

    if (orderId) query = query.where("order_id", orderId);
    if (paymentMethodId)
      query = query.where("payment_method_id", paymentMethodId);
    if (cashRegisterId)
      query = query.where("cash_register_session_id", cashRegisterId);
    if (locationId) {
      query = query.whereHas("order", (orderQuery) => {
        orderQuery.where("location_id", locationId);
      });
    }

    try {
      const orderPayments = await query
        .preload("order", (orderQuery) => orderQuery.preload("location"))
        .preload("paymentMethod", (pmQuery) => pmQuery.select("id", "name"))
        .preload("cashRegisterSession")
        .orderBy("processed_at", "desc")
        .paginate(page, perPage);

      return response.ok(orderPayments);
    } catch (error) {
      return response.internalServerError({
        message: "Ocurrió un error al obtener los pagos de órdenes.",
        error: error.message,
      });
    }
  }

  /**
   * REEMPLAZA TU MÉTODO ANTERIOR CON ESTE
   * Crea un nuevo pago (sale) o un reembolso (withdrawal) para una orden.
   */
  async store({
    request,
    response,
    companyId,
    cashRegisterSessionId,
    locationId,
    auth,
  }: HttpContext) {
    const trx = await db.transaction();
    try {
      // NOTA: Tu validador debe ser ajustado para requerir 'movementType' y 'amount' para withdrawals
      const payload = await request.validateUsing(
        createOrderPaymentValidator(companyId, locationId!),
      );
      const {
        orderId,
        paymentMethodId,
        notes,
        amount,
        movementType,
        adjustments = [],
      } = payload;

      const order = await Order.query({ client: trx })
        .where("id", orderId)
        .where("company_id", companyId)
        .preload("orderItems", (itemQuery: any) => {
          return itemQuery.preload("product", (subQuery: any) => {
            return subQuery.preload("category");
          });
        })
        .preload("table")
        .preload("payments")
        .preload("adjustments")
        .first();

      if (!order) {
        await trx.rollback();
        return response.notFound({
          message: "La orden no fue encontrada o no pertenece a la compañía.",
        });
      }

      /**
       * Importante:
       * Solo se aplican ajustes cuando realmente vienen ajustes desde el frontend.
       * Si viene [] o no viene nada, NO se borran los ajustes existentes.
       */
      const amountAlreadyPaid = order.payments.reduce(
        (sum, payment) => sum.plus(payment.amount),
        new Decimal(0),
      );

      const hasIncomingAdjustments =
        Array.isArray(adjustments) && adjustments.length > 0;

      if (hasIncomingAdjustments && amountAlreadyPaid.greaterThan(0)) {
        await trx.rollback();

        return response.conflict({
          message:
            "No se pueden modificar recargos o descuentos después de registrar el primer abono.",
        });
      }

      if (hasIncomingAdjustments) {
        await OrderAdjustmentService.applyAdjustments(order, adjustments, trx);
        await order.load("adjustments");
      }

      // --- FLUJO DE REEMBOLSO (WITHDRAWAL) ---
      if (movementType === "withdrawal") {
        const refundAmount = new Decimal(amount || 0);

        if (amountAlreadyPaid.lessThanOrEqualTo(0)) {
          await trx.rollback();
          return response.conflict({
            message:
              "No se puede hacer una devolución si no existen pagos previos.",
          });
        }
        if (refundAmount.greaterThan(amountAlreadyPaid)) {
          await trx.rollback();
          return response.conflict({
            message: `El monto a devolver (${refundAmount}) no puede ser mayor al total pagado (${amountAlreadyPaid}).`,
          });
        }

        const orderPayment = await OrderPayment.create(
          {
            orderId,
            paymentMethodId,
            notes: notes || `Reembolso para orden #${order.orderNumber}`,
            amount: refundAmount.negated().toNumber(), // <- Monto NEGATIVO
            cashRegisterSessionId,
            processedBy: auth.user!.id,
            processedAt: DateTime.now(),
          },
          { client: trx },
        );

        const cashMovement = await CashMovement.create(
          {
            companyId,
            cashRegisterSessionId,
            orderId,
            userId: auth.user!.id,
            movementType: "withdrawal", // <- Tipo de movimiento
            amount: refundAmount.toNumber(), // <- Monto POSITIVO
            notes: notes || `Reembolso para orden #${order.orderNumber}`,
          },
          { client: trx },
        );

        // MODIFICADO: La orden vuelve a estar pendiente de pago tras un reembolso.
        await order.merge({ status: "pending" }).save();

        // MODIFICADO: Registrar el cambio de estado en el historial.
        await OrderStatusHistory.create(
          {
            orderId: order.id,
            previousStatus: "paid",
            newStatus: "pending",
            changedBy: auth.user!.id,
            reason: "Reembolso procesado",
          },
          { client: trx },
        );

        // Verificar si la mesa debe ser desocupada después del pago
        if (order.orderType === "dine_in" && order.tableId) {
          // Necesitamos una instancia para llamar al método no estático
          const ordersController = new OrdersController();
          // OJO: El método en OrdersController debe ser público para ser llamado desde aquí
          // public async updateTableStatus(tableId: number, trx: any) { ... }
          await ordersController.updateTableStatus(order.tableId, trx);
        }

        await trx.commit();
        return response.created({
          message: `Reembolso de ${refundAmount.toNumber()} procesado exitosamente.`,
          orderPayment,
          cashMovement,
        });
      }

      // --- FLUJO DE PAGO (SALE) ---
      else {
        const totalAmountDue = new Decimal(order.totalAmount || 0);
        const pendingAmountBeforePayment =
          totalAmountDue.minus(amountAlreadyPaid);
        const requestedPaymentAmount = new Decimal(amount || 0);

        if (pendingAmountBeforePayment.lessThanOrEqualTo(0)) {
          await trx.rollback();
          return response.conflict({
            message:
              "La orden no tiene saldo pendiente de pago o ya fue pagada.",
          });
        }

        if (requestedPaymentAmount.lessThanOrEqualTo(0)) {
          await trx.rollback();
          return response.conflict({
            message: "El monto del pago debe ser mayor a cero.",
          });
        }

        if (requestedPaymentAmount.greaterThan(pendingAmountBeforePayment)) {
          await trx.rollback();
          return response.conflict({
            message: `El monto recibido (${requestedPaymentAmount.toNumber()}) no puede ser mayor al saldo pendiente (${pendingAmountBeforePayment.toNumber()}).`,
          });
        }

        const orderPayment = await OrderPayment.create(
          {
            orderId,
            paymentMethodId,
            notes: notes || `Pago parcial para orden #${order.orderNumber}`,
            amount: requestedPaymentAmount.toNumber(),
            cashRegisterSessionId,
            processedBy: auth.user!.id,
            processedAt: DateTime.now(),
          },
          { client: trx },
        );

        const cashMovement = await CashMovement.create(
          {
            companyId,
            cashRegisterSessionId,
            orderId,
            userId: auth.user!.id,
            movementType: "sale",
            amount: requestedPaymentAmount.toNumber(),
            notes: notes || `Pago parcial para orden #${order.orderNumber}`,
          },
          { client: trx },
        );

        const paidAmountAfterPayment = amountAlreadyPaid.plus(
          requestedPaymentAmount,
        );
        const pendingAmountAfterPayment = totalAmountDue.minus(
          paidAmountAfterPayment,
        );
        const isFullyPaid = pendingAmountAfterPayment.lessThanOrEqualTo(0);

        if (isFullyPaid) {
          const previousStatus = order.status;

          await order
            .merge({
              status: "paid",
              paidAt: DateTime.now(),
            })
            .save();

          await OrderStatusHistory.create(
            {
              orderId: order.id,
              previousStatus,
              newStatus: "paid",
              changedBy: auth.user!.id,
              reason: "Pago completado",
            },
            { client: trx },
          );
        }

        await trx.commit();

        const serializedAdjustments = (order.adjustments || []).map(
          (adjustment) => ({
            id: adjustment.id,
            type: adjustment.type,
            description: adjustment.description,
            amount: Number(adjustment.amount || 0),
          }),
        );

        const paymentSummary = {
          totalAmount: totalAmountDue.toNumber(),
          paidAmount: paidAmountAfterPayment.toNumber(),
          pendingAmount: Decimal.max(
            pendingAmountAfterPayment,
            new Decimal(0),
          ).toNumber(),
          isFullyPaid,
          adjustments: serializedAdjustments,
        };

        const roomName = `kitchen_room_${companyId}_${locationId}`;
        io.to(roomName).emit("order_updated", {
          ...order.serialize(),
          paymentSummary,
        });

        if (isFullyPaid && order.isServed) {
          io.to(roomName).emit("order_payment_completed", {
            ...order.serialize(),
            paymentSummary,
          });
        }

        return response.created({
          message: isFullyPaid
            ? `Pago final de ${requestedPaymentAmount.toNumber()} procesado exitosamente.`
            : `Pago parcial de ${requestedPaymentAmount.toNumber()} procesado exitosamente.`,
          orderPayment,
          cashMovement,
          paymentSummary,
        });
      }
    } catch (error) {
      await trx.rollback();
      // ... (manejo de errores sin cambios)
      if (error.status === 422 || error.code === "E_VALIDATION_ERROR") {
        return response.status(422).json({
          message: "Los datos enviados no son válidos",
          errors: error.messages || [],
        });
      }
      if (error.code && error.code.startsWith("ER_")) {
        return response.status(400).json({
          message: "Error en la base de datos",
          error: "Hay un problema con los datos proporcionados",
        });
      }
      console.error("Error creating order payment:", error);
      return response.internalServerError({
        message: "Ocurrió un error interno al crear el pago.",
        error: error.message,
      });
    }
  }

  /**
   * Show individual record
   */
  async show({ response, params, companyId }: HttpContext) {
    try {
      const orderPayment = await OrderPayment.query()
        .whereHas("order", (orderQuery) =>
          orderQuery.where("company_id", companyId),
        )
        .where("id", params.id)
        .preload("order", (orderQuery) => orderQuery.preload("location"))
        .preload("paymentMethod", (pmQuery) => pmQuery.select("id", "name"))
        .preload("cashRegisterSession")
        .firstOrFail();

      return response.ok(orderPayment);
    } catch (error) {
      return response.notFound({
        message: `El pago con ID ${params.id} no fue encontrado.`,
      });
    }
  }

  /**
   * Handle form submission for the edit action
   */
  async update({ response }: HttpContext) {
    return response.badRequest({
      message: "Los pagos no pueden ser modificados por trazabilidad.",
    });
  }

  /**
   * Delete record
   */
  async destroy({ response }: HttpContext) {
    return response.badRequest({
      message: "Los pagos no pueden ser eliminados por trazabilidad.",
    });
  }
}
