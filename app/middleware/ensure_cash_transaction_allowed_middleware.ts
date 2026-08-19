import CashRegisterOperatingService, {
  CASH_REGISTER_PREVIOUS_BUSINESS_DAY,
} from '#services/cash_register_operating_service'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import db from '@adonisjs/lucid/services/db'

export default class EnsureCashTransactionAllowedMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    const { companyId, locationId, response } = ctx

    if (!companyId || !locationId) {
      return response.badRequest({
        message: 'La compania y la sucursal son requeridas.',
      })
    }

    const trx = await db.transaction()
    ctx.cashTransactionTrx = trx

    try {
      const operatingService = new CashRegisterOperatingService()
      const state = await operatingService.getState(companyId, locationId, {
        trx,
        lockForUpdate: true,
      })

      operatingService.applyStateToContext(ctx, state)

      if (state.status === 'no_open_session') {
        await trx.rollback()
        return response.status(403).json({
          message:
            'Accion prohibida: Es necesario tener una sesion de caja abierta.',
          code: 'CASH_REGISTER_SESSION_REQUIRED',
        })
      }

      if (state.isPreviousBusinessDay && !state.recoveryIsActive) {
        await trx.rollback()
        return response.status(409).json({
          message:
            `Hay una caja abierta del dia operativo ${state.sessionBusinessDate}. ` +
            'Cierra la caja anterior o solicita una autorizacion de recuperacion.',
          code: CASH_REGISTER_PREVIOUS_BUSINESS_DAY,
          data: state,
        })
      }

      if (
        state.isPreviousBusinessDay &&
        state.recoveryIsActive &&
        ctx.request.method() === 'DELETE'
      ) {
        await trx.rollback()
        return response.status(409).json({
          message:
            'Durante la recuperacion, las cancelaciones deben usar el flujo controlado de cancelacion de comandas.',
          code: 'CASH_RECOVERY_CONTROLLED_CANCELLATION_REQUIRED',
          data: state,
        })
      }

    } catch (error) {
      if (!trx.isCompleted) {
        await trx.rollback()
      }
      console.error('Error al validar la jornada de la caja:', error)
      return response.internalServerError({
        message: 'No fue posible validar el dia operativo de la caja.',
      })
    }

    try {
      await next()
      if (!trx.isCompleted) {
        await trx.commit()
      }
    } catch (error) {
      if (!trx.isCompleted) {
        await trx.rollback()
      }
      throw error
    }
  }
}
