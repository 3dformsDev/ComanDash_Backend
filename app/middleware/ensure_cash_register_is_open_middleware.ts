import CashRegister from '#models/cash_register'
import CashRegisterSession from '#models/cash_registers_session'
import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class EnsureCashRegisterIsOpenMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    try {
      const { auth, response, companyId } = ctx;
      const user = auth.user!

      //Verificar que existe un cash register
      const cashRegisterExists = await CashRegister.query()
        .where('company_id', companyId)
        .where('location_id', user.locationId!)
        .first();

      if (!cashRegisterExists) {
        return response.status(403).json({
          message: 'Acción prohibida: Es necesario tener una caja en la empresa y habilitar una sesión para realizar esta operación.',
        })
      }


      // 2. Usamos el método query() del modelo para construir la consulta
      const openSession = await CashRegisterSession.query()
        .where('company_id', companyId)
        .whereHas('cashRegister', (query) => {
          return query.where('location_id', user.locationId!);
        })
        .where('status', 'open')
        .first();

      if (!openSession) {
        return response.status(403).json({
          message: 'Acción prohibida: Es necesario tener una sesión de caja abierta para realizar esta operación.',
        })
      }

      ctx.cashRegisterSessionId = openSession?.id;

      await next()
    } catch (error) {
      console.error('Error en el middleware EnsureCashRegisterIsOpen:', error)
      return ctx.response.status(500).json({
        message: 'Ocurrió un error interno al verificar el estado de la caja.',
      })
    }
  }
}