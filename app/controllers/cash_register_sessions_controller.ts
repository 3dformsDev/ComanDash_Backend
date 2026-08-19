import ActivityLog from "#models/activity_log";
import CashMovement from "#models/cash_movement";
import CashRegister from "#models/cash_register";
import CashRegisterSession from "#models/cash_registers_session";
import Order from "#models/order";
import {
  BUSINESS_TIME_ZONE,
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  getBusinessDayCutoffHour,
  getCurrentBusinessDate,
  saveBusinessDayCutoffHour,
} from "#services/reports/business_day_service";
import CashRegisterOperatingService, {
  CASH_RECOVERY_DURATION_MINUTES,
} from "#services/cash_register_operating_service";
import { io } from "#start/socket";
import {
  buildSalesReport,
  getCancelledOrdersForRange,
  getPaidOrdersForRange,
} from "#services/reports/sales_reporting_service";
import { businessDaySettingValidator } from "#validators/business_day_setting";
import { authorizeCashRecoveryValidator } from "#validators/cash_recovery";
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
        .where("company_id", companyId)
        .firstOrFail();
      const locationId = cashRegister.locationId;
      const businessDayCutoffHour = await getBusinessDayCutoffHour(
        companyId,
        locationId,
      );
      // 2. Buscamos si ya existe CUALQUIER sesión abierta en esa sucursal.
      // Usamos `whereHas` para consultar a través de la relación.
      const existingOpenSessionInLocation = await CashRegisterSession.query({
        client: trx,
      })
        .where("company_id", companyId)
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
        businessDate: DateTime.fromISO(
          getCurrentBusinessDate(businessDayCutoffHour),
        ),
        businessDayCutoffHour,
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
            businessDate: cashRegisterSession.businessDate || undefined,
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
    auth,
    request: httpRequest,
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
        .whereHas("cashRegister", (query) => {
          query
            .where("company_id", companyId)
            .where("location_id", locationId!);
        })
        .forUpdate()
        .firstOrFail();

      // 2. Validaciones de negocio
      if (cashRegisterSession.status === "closed") {
        await trx.rollback();
        return response.conflict({
          message: "Esta sesión de caja ya ha sido cerrada.",
        });
      }

      // VALIDACIÓN 1: No deben existir comandas pendientes de entregar.
      const activeKitchenOrdersCount = await Order.query({ client: trx })
        .where("company_id", companyId)
        .where("location_id", locationId!)
        .where("cash_register_session_id", params.id)
        .whereNotIn("status", ["cancelled"])
        .whereHas("orderItems", (itemQuery) => {
          itemQuery.whereIn("kitchen_status", [
            "in_preparation",
            "pending",
            "ready",
          ]);
        })
        .count("* as total");

      const activeKitchenOrdersTotal = Number(
        activeKitchenOrdersCount[0].$extras.total,
      );
      if (activeKitchenOrdersTotal > 0) {
        await trx.rollback();
        return response.conflict({
          message: `No se puede cerrar la caja. Aún existen (${activeKitchenOrdersTotal}) comandas pendientes de entregar.`,
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
        closedAt: DateTime.now(),
        recoveryAuthorizedUntil: null,
        recoveryAuthorizedBy: null,
        recoveryReason: null,
      };

      const recoveryWasConfigured = Boolean(
        cashRegisterSession.recoveryAuthorizedUntil ||
          cashRegisterSession.recoveryAuthorizedBy ||
          cashRegisterSession.recoveryReason,
      );

      await cashRegisterSession.merge(updateData).save();

      if (recoveryWasConfigured) {
        await ActivityLog.create(
          {
            companyId,
            userId: auth.user!.id,
            action: "cash_recovery_ended_by_close",
            resourceType: "cash_register_session",
            resourceId: cashRegisterSession.id,
            details: {
              businessDate: cashRegisterSession.businessDate?.toISODate(),
            },
            ipAddress: httpRequest.ip(),
            userAgent: httpRequest.header("user-agent"),
          },
          { client: trx },
        );
      }

      await trx.commit();

      try {
        // ✅ PASO CLAVE: Notificar a todos los clientes en la misma sucursal
        const roomName = `kitchen_room_${companyId}_${locationId}`;
        // Enviamos el objeto de la sesión recién cerrada como dato
        io.to(roomName).emit(
          "cash_register_closed",
          cashRegisterSession.serialize(),
        );
      } catch (notificationError) {
        console.error(
          "La caja se cerro, pero no fue posible notificarlo por socket:",
          notificationError,
        );
      }

      return response.ok(cashRegisterSession);
    } catch (error) {
      if (!trx.isCompleted) {
        await trx.rollback();
      }
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
   * Obtiene la configuracion del dia operativo para la sede actual.
   */
  public async getBusinessDaySettings({
    response,
    companyId,
    locationId,
  }: HttpContext) {
    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    try {
      const cutoffHour = await getBusinessDayCutoffHour(
        companyId,
        locationId,
      );

      return response.ok({
        data: {
          businessTimeZone: BUSINESS_TIME_ZONE,
          cutoffHour,
          defaultCutoffHour: DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
        },
      });
    } catch (error) {
      console.error("Error al consultar el dia operativo:", error);
      return response.internalServerError({
        message: "No fue posible consultar la configuracion del dia operativo.",
      });
    }
  }

  public async updateBusinessDaySettings({
    request,
    response,
    companyId,
    locationId,
  }: HttpContext) {
    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    const { cutoffHour } = await request.validateUsing(
      businessDaySettingValidator,
    );

    try {
      const openSession = await CashRegisterSession.query()
        .where("company_id", companyId)
        .where("status", "open")
        .whereHas("cashRegister", (query) => {
          query
            .where("company_id", companyId)
            .where("location_id", locationId);
        })
        .first();

      if (openSession) {
        return response.conflict({
          message:
            "Cierra la caja activa antes de modificar el dia operativo.",
        });
      }

      const savedCutoffHour = await saveBusinessDayCutoffHour(
        companyId,
        locationId,
        cutoffHour,
      );

      return response.ok({
        data: {
          businessTimeZone: BUSINESS_TIME_ZONE,
          cutoffHour: savedCutoffHour,
          defaultCutoffHour: DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
        },
        message: "Configuracion del dia operativo actualizada.",
      });
    } catch (error) {
      console.error("Error al actualizar el dia operativo:", error);
      return response.internalServerError({
        message: "No fue posible actualizar la configuracion del dia operativo.",
      });
    }
  }

  /**
   * Proporciona un resumen del dia operativo para la sede actual.
   */
  public async getDailyBusinessSummary({
    response,
    companyId,
    locationId,
  }: HttpContext) {
    try {
      if (!companyId || !locationId) {
        return response.badRequest({
          message: "La compania y la sucursal son requeridas.",
        });
      }

      const cutoffHour = await getBusinessDayCutoffHour(
        companyId,
        locationId,
      );
      const businessDate = getCurrentBusinessDate(cutoffHour);

      const [report, paidOrders, cancelledOrders] = await Promise.all([
        buildSalesReport(
          companyId,
          locationId,
          businessDate,
          businessDate,
          cutoffHour,
        ),
        getPaidOrdersForRange(
          companyId,
          locationId,
          businessDate,
          businessDate,
          cutoffHour,
        ),
        getCancelledOrdersForRange(
          companyId,
          locationId,
          businessDate,
          businessDate,
          cutoffHour,
        ),
      ]);

      const summary = report.summary;
      const cashRegisterState = await new CashRegisterOperatingService().getState(
        companyId,
        locationId,
      );

      const summaryData = {
        businessDate,
        businessTimeZone: BUSINESS_TIME_ZONE,
        businessDayCutoffHour: cutoffHour,
        totalRevenue: summary.totalSales,
        totalOrders: summary.totalOrders,
        tableOrders: summary.tableOrders,
        takeawayOrders: summary.takeawayOrders,
        ordersInProcess: summary.inProcessOrders,
        ordersFinished: summary.totalOrders,
        ordersCancelled: summary.cancelledOrders,
        topProducts: report.tableRows.slice(0, 5).map((product) => ({
          name: product.productName,
          count: product.quantity,
          category: {
            name: product.category,
          },
        })),
        financialSummary: summary,
        cuts: report.cuts,
        paidOrders,
        cancelledOrders,
        cashRegisterState,
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

  public async getOperatingState({
    response,
    companyId,
    locationId,
  }: HttpContext) {
    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    try {
      const state = await new CashRegisterOperatingService().getState(
        companyId,
        locationId,
      );
      return response.ok({ data: state });
    } catch (error) {
      console.error("Error al consultar el estado operativo de la caja:", error);
      return response.internalServerError({
        message: "No fue posible consultar el estado operativo de la caja.",
      });
    }
  }

  public async authorizeRecovery({
    request,
    response,
    auth,
    companyId,
    locationId,
    params,
  }: HttpContext) {
    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    await auth.user!.load("role");
    if (
      !["super_admin", "admin", "manager"].includes(
        auth.user!.role?.code || "",
      )
    ) {
      return response.forbidden({
        message: "Solo un administrador o gerente puede autorizar la recuperacion.",
      });
    }

    const { reason } = await request.validateUsing(
      authorizeCashRecoveryValidator,
    );
    const trx = await db.transaction();

    try {
      const operatingService = new CashRegisterOperatingService();
      const state = await operatingService.getState(companyId, locationId, {
        trx,
        lockForUpdate: true,
      });

      if (
        state.status !== "open_previous" ||
        state.sessionId !== Number(params.id)
      ) {
        await trx.rollback();
        return response.conflict({
          message:
            "La sesion indicada no esta abierta o no pertenece a un dia operativo anterior.",
        });
      }

      const session = await CashRegisterSession.query({ client: trx })
        .where("id", state.sessionId)
        .where("company_id", companyId)
        .firstOrFail();
      const action = state.recoveryIsActive
        ? "cash_recovery_renewed"
        : "cash_recovery_authorized";
      const authorizedUntil = DateTime.now().plus({
        minutes: CASH_RECOVERY_DURATION_MINUTES,
      });

      session.businessDate ||= DateTime.fromISO(state.sessionBusinessDate!);
      session.businessDayCutoffHour ||= state.businessDayCutoffHour;
      session.recoveryAuthorizedUntil = authorizedUntil;
      session.recoveryAuthorizedBy = auth.user!.id;
      session.recoveryReason = reason;
      await session.save();

      await ActivityLog.create(
        {
          companyId,
          userId: auth.user!.id,
          action,
          resourceType: "cash_register_session",
          resourceId: session.id,
          details: {
            reason,
            businessDate: state.sessionBusinessDate,
            authorizedUntil: authorizedUntil.toISO(),
            durationMinutes: CASH_RECOVERY_DURATION_MINUTES,
          },
          ipAddress: request.ip(),
          userAgent: request.header("user-agent"),
        },
        { client: trx },
      );

      const updatedState = await operatingService.getState(
        companyId,
        locationId,
        { trx },
      );

      await trx.commit();

      try {
        io.to(`kitchen_room_${companyId}_${locationId}`).emit(
          "cash_register_recovery_changed",
          updatedState,
        );
      } catch (notificationError) {
        console.error(
          "La recuperacion se autorizo, pero no fue posible notificarlo por socket:",
          notificationError,
        );
      }

      return response.ok({
        data: updatedState,
        message: "Modo recuperacion habilitado durante 60 minutos.",
      });
    } catch (error) {
      if (!trx.isCompleted) {
        await trx.rollback();
      }
      console.error("Error al autorizar la recuperacion de caja:", error);
      return response.internalServerError({
        message: "No fue posible autorizar la recuperacion de caja.",
      });
    }
  }

  public async endRecovery({
    request,
    response,
    auth,
    companyId,
    locationId,
    params,
  }: HttpContext) {
    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    await auth.user!.load("role");
    if (
      !["super_admin", "admin", "manager"].includes(
        auth.user!.role?.code || "",
      )
    ) {
      return response.forbidden({
        message: "Solo un administrador o gerente puede finalizar la recuperacion.",
      });
    }

    const trx = await db.transaction();
    try {
      const session = await CashRegisterSession.query({ client: trx })
        .where("id", params.id)
        .where("company_id", companyId)
        .where("status", "open")
        .whereHas("cashRegister", (query) => {
          query
            .where("company_id", companyId)
            .where("location_id", locationId);
        })
        .forUpdate()
        .firstOrFail();

      session.recoveryAuthorizedUntil = null;
      session.recoveryAuthorizedBy = null;
      session.recoveryReason = null;
      await session.save();

      await ActivityLog.create(
        {
          companyId,
          userId: auth.user!.id,
          action: "cash_recovery_ended",
          resourceType: "cash_register_session",
          resourceId: session.id,
          details: {
            businessDate: session.businessDate?.toISODate(),
          },
          ipAddress: request.ip(),
          userAgent: request.header("user-agent"),
        },
        { client: trx },
      );

      const updatedState = await new CashRegisterOperatingService().getState(
        companyId,
        locationId,
        { trx },
      );

      await trx.commit();

      try {
        io.to(`kitchen_room_${companyId}_${locationId}`).emit(
          "cash_register_recovery_changed",
          updatedState,
        );
      } catch (notificationError) {
        console.error(
          "La recuperacion finalizo, pero no fue posible notificarlo por socket:",
          notificationError,
        );
      }

      return response.ok({ data: updatedState });
    } catch (error) {
      if (!trx.isCompleted) {
        await trx.rollback();
      }
      if (error.code === "E_ROW_NOT_FOUND") {
        return response.notFound({
          message: "La sesion de caja abierta no fue encontrada.",
        });
      }
      console.error("Error al finalizar la recuperacion de caja:", error);
      return response.internalServerError({
        message: "No fue posible finalizar la recuperacion de caja.",
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
