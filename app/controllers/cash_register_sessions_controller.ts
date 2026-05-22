import CashMovement from "#models/cash_movement";
import CashRegister from "#models/cash_register";
import CashRegisterSession from "#models/cash_registers_session";
import Order from "#models/order";
import OrderItem from "#models/order_item";
import { io } from "#start/socket";
import {
  closeCashRegisterSessionValidatorWithCompany,
  createCashRegisterSessionValidatorWithCompany,
} from "#validators/cash_register_session";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";
import { Decimal } from "decimal.js";
import { DateTime } from "luxon";

export default class CashRegisterSessionsController {
  /**
   * List all cash registers for the authenticated user's company.
   */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData(); // Ya incluye company_id automáticamente
    const page = queryData.page || 1;
    const perPage = queryData.perPage || 10;

    try {
      const cashRegisters = await CashRegisterSession.withCompanyFilter(
        companyId,
      ).paginate(page, perPage);

      return response.ok(cashRegisters);
    } catch (error) {
      return response.internalServerError({
        message: "Failed to fetch cash registers.",
        error: error.message,
      });
    }
  }

  /**
   * Create a new cashRegisterSession for the authenticated user's company.
   */
  async store({
    request,
    response,
    auth,
    companyId,
    currentUser,
  }: HttpContext) {
    const trx = await db.transaction();
    try {
      // Crear el validador con el companyId del contexto
      const validator =
        createCashRegisterSessionValidatorWithCompany(companyId);
      const payload = await request.validateUsing(validator);

      // 1. A partir del ID de la caja en el payload, obtenemos su sucursal (locationId).
      // Usamos findOrFail para detenernos si la caja no existe.
      const cashRegister = await CashRegister.query({ client: trx })
        .where("id", payload.cashRegisterId)
        .firstOrFail();
      const locationId = cashRegister.locationId;
      // 2. Buscamos si ya existe CUALQUIER sesión abierta en esa sucursal.
      // Usamos `whereHas` para consultar a través de la relación.
      const existingOpenSessionInLocation = await CashRegisterSession.query({
        client: trx,
      })
        .where("status", "open")
        .whereHas("cashRegister", (query) => {
          query.where("location_id", locationId);
        })
        .first();

      // 3. Si se encuentra una, se anula la operación y se devuelve un error de conflicto.
      if (existingOpenSessionInLocation) {
        await trx.rollback();
        return response.conflict({
          message: `Ya existe una sesión de caja abierta en esta sucursal. Solo se permite una sesión activa por sucursal a la vez.`,
        });
      }

      const cashRegisterSessionData = {
        ...payload,
        companyId,
        userId: currentUser.id,
      };

      const cashRegisterSession = await CashRegisterSession.create(
        cashRegisterSessionData,
        { client: trx },
      );

      if (payload.openingBalance && payload.openingBalance != 0) {
        // CORRECCIÓN: Registrar el cambio de estado en el historial
        await CashMovement.create(
          {
            companyId,
            cashRegisterSessionId: cashRegisterSession.id,
            movementType: "deposit",
            userId: auth.user!.id,
            amount: payload.openingBalance,
            notes: "Monto apertura de caja",
          },
          { client: trx },
        );
      }

      await trx.commit();

      return response.created(cashRegisterSession);
    } catch (error) {
      await trx.rollback();
      if (
        error.code === "E_VALIDATION_ERROR" ||
        error.code === "E_VALIDATION_FAILURE"
      ) {
        return response.unprocessableEntity({ errors: error.messages });
      }
      if (error.code === "ER_DUP_ENTRY") {
        return response.conflict({
          message: `A Cash Register session with the name "${request.input("name")}" already exists for your company.`,
        });
      }
      return response.internalServerError({
        message: "An error occurred while creating the Cash Register.",
        error: error.message,
      });
    }
  }

  /**
   * Show a specific cashRegisterSession (only from user's company).
   */
  async show({ params, response, companyId }: HttpContext) {
    try {
      const cashRegisterSession = await CashRegisterSession.withCompanyFilter(
        companyId,
      )
        .where("id", params.id)
        .firstOrFail();

      return response.ok(cashRegisterSession);
    } catch (error) {
      return response.notFound({
        message: `Cash Register Session with ID ${params.id} not found.`,
      });
    }
  }

  /**
   * Cierra una sesión de caja. Este es el único método permitido para cambiar el estado a 'closed'.
   * Calcula todos los balances finales en el backend para garantizar la integridad de los datos.
   */
  async closeSession({
    request,
    response,
    params,
    companyId,
    locationId,
  }: HttpContext) {
    // 1. Validar el payload de entrada (solo realClosingBalance y notas)
    const payload = await request.validateUsing(
      closeCashRegisterSessionValidatorWithCompany(),
    );

    const trx = await db.transaction();
    try {
      const cashRegisterSession = await CashRegisterSession.query({
        client: trx,
      })
        .where("id", params.id)
        .where("company_id", companyId)
        .firstOrFail();

      // 2. Validaciones de negocio
      if (cashRegisterSession.status === "closed") {
        await trx.rollback();
        return response.conflict({
          message: "Esta sesión de caja ya ha sido cerrada.",
        });
      }

      // VALIDACIÓN 1: No deben existir órdenes EN PREPARACIÓN.
      const pendingItemsCount = await OrderItem.query()
        .where("kitchen_status", "in_preparation")
        .whereHas("order", (orderQuery) => {
          orderQuery.where("cash_register_session_id", params.id);
        })
        .count("* as total");

      if (Number(pendingItemsCount[0].$extras.total) > 0) {
        await trx.rollback();
        return response.conflict({
          message: `No se puede cerrar la caja. Aún existen (${pendingItemsCount[0].$extras.total}) órdenes en preparación.`,
        });
      }

      // --- INICIO DEL BLOQUE DE VALIDACIÓN MODIFICADO ---
      // VALIDACIÓN 2: Todas las órdenes deben estar en estado 'paid' o 'cancelled'.
      const unsettledOrder = await Order.query({ client: trx })
        .where("cash_register_session_id", params.id)
        .whereNotIn("status", ["paid", "cancelled"]) // La clave está aquí
        .first(); // Solo necesitamos encontrar una para fallar

      if (unsettledOrder) {
        await trx.rollback();
        return response.conflict({
          message: `No se puede cerrar la caja. La orden #${unsettledOrder.orderNumber} todavía tiene un estado de '${unsettledOrder.status}' y debe ser pagada o cancelada.`,
        });
      }
      // --- FIN DEL BLOQUE DE VALIDACIÓN MODIFICADO ---

      // 3. Calcular balances en el backend
      const movements = await CashMovement.query({ client: trx }).where(
        "cash_register_session_id",
        params.id,
      );

      let totalSales = new Decimal(0);
      let totalWithdrawals = new Decimal(0);

      movements.forEach((movement) => {
        if (movement.movementType === "sale") {
          totalSales = totalSales.plus(movement.amount);
        } else if (movement.movementType === "withdrawal") {
          totalWithdrawals = totalWithdrawals.plus(movement.amount);
        }
      });

      const openingBalance = new Decimal(cashRegisterSession.openingBalance);
      const calculatedClosingBalance = openingBalance
        .plus(totalSales)
        .minus(totalWithdrawals);
      const realClosingBalance = new Decimal(payload.realClosingBalance);
      const differenceAmount = realClosingBalance.minus(
        calculatedClosingBalance,
      );

      // 4. Preparar y guardar los datos finales
      const updateData = {
        ...payload,
        status: "closed" as const,
        closingBalance: calculatedClosingBalance.toNumber(),
        realClosingBalance: realClosingBalance.toNumber(),
        differenceAmount: differenceAmount.toNumber(),
        closedAt: payload.closedAt
          ? DateTime.fromJSDate(payload.closedAt)
          : DateTime.now(),
      };

      await cashRegisterSession.merge(updateData).save();

      await trx.commit();

      // ✅ PASO CLAVE: Notificar a todos los clientes en la misma sucursal
      const roomName = `kitchen_room_${companyId}_${locationId}`;
      // Enviamos el objeto de la sesión recién cerrada como dato
      io.to(roomName).emit(
        "cash_register_closed",
        cashRegisterSession.serialize(),
      );

      return response.ok(cashRegisterSession);
    } catch (error) {
      await trx.rollback();
      if (error.code === "E_VALIDATION_ERROR") {
        return response.unprocessableEntity({ errors: error.messages });
      }
      if (error.code === "E_ROW_NOT_FOUND") {
        return response.notFound({
          message: "La sesión de caja no fue encontrada.",
        });
      }
      return response.internalServerError({
        message: "Ocurrió un error al cerrar la sesión de caja.",
        error: error.message,
      });
    }
  }

  /**
   * Obtiene un resumen detallado de la sesión de caja, incluyendo desglose por método de pago.
   * La lógica ha sido mejorada para excluir pagos de órdenes canceladas, dando un total de ventas real.
   */
  async getSummary({ response, params, companyId }: HttpContext) {
    try {
      const cashRegisterSession = await CashRegisterSession.query()
        .where("id", params.id)
        .where("company_id", companyId)
        .firstOrFail();

      // Si la sesión ya está cerrada, devuelve los datos guardados. (Esta parte está bien)
      if (cashRegisterSession.status === "closed") {
        const closedSummary = {
          status: "closed",
          openingBalance: cashRegisterSession.openingBalance,
          closingBalance: cashRegisterSession.closingBalance,
          realClosingBalance: cashRegisterSession.realClosingBalance,
          differenceAmount: cashRegisterSession.differenceAmount,
          closedAt: cashRegisterSession.closedAt,
        };
        return response.ok({ data: closedSummary });
      }

      // --- Inicia el cálculo para una sesión abierta ---
      const openingBalance = new Decimal(cashRegisterSession.openingBalance);

      // ✅ 1. NUEVA LÓGICA: Calcular las ventas y el desglose desde la misma fuente.
      // Obtenemos los pagos de órdenes NO canceladas para el desglose.
      const incomeSummary = await db
        .from("order_payments")
        .join(
          "payment_methods",
          "order_payments.payment_method_id",
          "=",
          "payment_methods.id",
        )
        .join("orders", "order_payments.order_id", "=", "orders.id")
        .where("order_payments.cash_register_session_id", params.id)
        .where("orders.status", "paid") // ✅ CAMBIO: Solo órdenes pagadas, no solo "no canceladas"
        .whereNotNull("paid_at")
        .groupBy("payment_methods.name")
        .select(
          "payment_methods.name as paymentMethodName",
          db.raw("SUM(order_payments.amount) as totalAmount"),
        );

      // ✅ 2. OBTENER EL TOTAL DE VENTAS REAL a partir de la tabla de órdenes
      const salesResult = await db
        .from("orders")
        .where("cash_register_session_id", params.id)
        .where("status", "paid")
        .sum("total_amount as total")
        .first();

      let totalSales = new Decimal(salesResult.total || 0);

      // 3. Consulta de retiros (sin cambios, ya era correcta)
      const withdrawalsResult = await CashMovement.query()
        .where("cash_register_session_id", params.id)
        .where("movementType", "withdrawal")
        .sum("amount as total")
        .first();

      const totalWithdrawals = new Decimal(
        withdrawalsResult?.$extras.total || 0,
      );

      // Sumar totalWithdrawals al totalSales actual
      totalSales = totalSales.plus(totalWithdrawals);

      // 4. Calcular el balance esperado con el total de ventas correcto
      const expectedClosingBalance = openingBalance
        .plus(totalSales)
        .minus(totalWithdrawals);

      // 5. Construir la respuesta
      const summary = {
        status: cashRegisterSession.status,
        openingBalance: openingBalance.toNumber(),
        transactions: {
          incomeByPaymentMethod: incomeSummary.map((item) => ({
            name: item.paymentMethodName,
            total: new Decimal(item.totalAmount).toNumber(),
          })),
          // Usamos el total de ventas REAL
          totalSales: totalSales.toNumber(),
          totalWithdrawals: totalWithdrawals.toNumber(),
        },
        expectedClosingBalance: expectedClosingBalance.toNumber(),
      };

      return response.ok({ data: summary });
    } catch (error) {
      if (error.code === "E_ROW_NOT_FOUND") {
        return response.notFound({
          message:
            "La sesión de caja no fue encontrada o no pertenece a tu compañía.",
        });
      }
      console.error(error); // ✅ Buena práctica: Loguear el error en el servidor
      return response.internalServerError({
        message: "Ocurrió un error al obtener el resumen de la caja.",
        error: error.message,
      });
    }
  }

  /**
   * Proporciona un resumen operativo de la sesión de caja activa.
   */
  public async getDailyBusinessSummary({
    response,
    companyId,
    locationId,
    cashRegisterSessionId,
  }: HttpContext) {
    try {
      if (!cashRegisterSessionId) {
        return response.badRequest({
          message: "No existe una caja abierta para obtener el resumen.",
        });
      }

      const [totalMetrics, statusCounts, typeCounts, topProducts] =
        await Promise.all([
          // Consulta A: Ingresos totales y comandas válidas
          Order.query()
            .where("companyId", companyId!)
            .where("locationId", locationId!)
            .whereNotNull("paidAt")
            .whereNot("status", "cancelled")
            .where("cashRegisterSessionId", cashRegisterSessionId)
            .sum("total_amount as totalRevenue")
            .count("* as totalOrders")
            .first(),

          // Consulta B: Conteo de comandas por estado (Usa Query Builder, snake_case es correcto aquí)
          db
            .from("orders")
            .where("company_id", companyId!)
            .where("location_id", locationId!)
            .where("cash_register_session_id", cashRegisterSessionId)
            .groupBy("status")
            .select("status")
            .count("* as count"),

          // Consulta C: Conteo por tipo de orden (mesa vs. llevar)
          Order.query()
            .where("companyId", companyId!)
            .where("locationId", locationId!)
            .whereNot("status", "cancelled")
            .where("cashRegisterSessionId", cashRegisterSessionId)
            .groupBy("orderType")
            .select("orderType")
            .count("* as count"),

          // Consulta D: Top 5 productos más vendidos (Usa Query Builder, snake_case es correcto aquí)
          db
            .from("order_items")
            .join("orders", "order_items.order_id", "orders.id")
            .join("products", "order_items.product_id", "products.id")
            .join("categories", "products.category_id", "categories.id")
            .where("orders.company_id", companyId!)
            .where("orders.location_id", locationId!)
            .whereNot("orders.status", "cancelled")
            .where("orders.cash_register_session_id", cashRegisterSessionId)
            .groupBy("products.name", "categories.id", "categories.name")
            .select(
              "products.name",
              "categories.id as categoryId",
              "categories.name as categoryName",
            )
            .sum("order_items.quantity as count")
            .orderBy("count", "desc")
            .limit(5),
        ]);

      // ✅ SOLUCION: Función para procesar modelos de Lucid correctamente
      const processLucidCounts = (models: any[], keyField: string) => {
        return models.reduce((acc, model) => {
          // Para modelos de Lucid, el campo está en $attributes y el count en $extras
          const key = model.$attributes[keyField];
          const count = parseInt(model.$extras.count, 10);
          acc[key] = count;
          return acc;
        }, {});
      };

      // ✅ SOLUCION: Función para procesar resultados de Query Builder (objetos planos)
      const processPlainCounts = (rows: any[], keyField: string) => {
        return rows.reduce((acc, row) => {
          // Para Query Builder, los campos están directamente en el objeto
          acc[row[keyField]] = parseInt(row.count, 10);
          return acc;
        }, {});
      };

      // ✅ CORREGIDO: Usar la función correcta para cada tipo de consulta
      const statusResults = processPlainCounts(statusCounts, "status"); // Query Builder
      const typeResults = processLucidCounts(typeCounts, "orderType"); // Modelo Lucid

      const summaryData = {
        totalRevenue: new Decimal(
          totalMetrics?.$extras.totalRevenue || 0,
        ).toNumber(),
        totalOrders: parseInt(totalMetrics?.$extras.totalOrders || "0", 10),
        // ✅ CORREGIDO: Usar las claves correctas según los valores de la BD
        tableOrders: typeResults["dine_in"] || 0,
        takeawayOrders: typeResults["takeaway"] || 0,
        ordersInProcess: statusResults["pending"] || 0,
        ordersFinished: statusResults["paid"] || 0,
        ordersCancelled: statusResults["cancelled"] || 0,
        topProducts: topProducts.map((p) => ({
          name: p.name,
          count: parseInt(p.count, 10),
          category: {
            id: p.categoryId,
            name: p.categoryName,
          },
        })),
      };

      return response.ok({ data: summaryData });
    } catch (error) {
      console.error("Error al generar el resumen de la sesión:", error);
      return response.internalServerError({
        message: "Ocurrió un error al generar el resumen de la sesión.",
        error: error.message,
      });
    }
  }
  /**
   * Delete a specific cashRegisterSession (only from user's company).
   */
  async destroy({ params, response }: HttpContext) {
    try {
      // ❌ No se elimina, solo se devuelve un error de negocio
      return response.unprocessableEntity({
        message: `No es posible eliminar la Cash Register Session con ID ${params.id} por motivos de trazabilidad.`,
      });
    } catch (error) {
      if (error.code === "E_ROW_NOT_FOUND") {
        return response.notFound({
          message: `Cash Register Session con ID ${params.id} no encontrada.`,
        });
      }
      return response.internalServerError({
        message: "Ocurrió un error al intentar procesar la operación.",
        error: error.message,
      });
    }
  }
}
