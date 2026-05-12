import CashRegister from '#models/cash_register'
import CashRegisterSession from '#models/cash_registers_session'
import { createCashRegisterValidatorWithCompany, updateCashRegisterValidatorWithCompany } from '#validators/cash_register'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'

export default class CashRegistersController {
  /**
     * List all cash registers for the authenticated user's company.
     */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData()
    const page = queryData.page || 1
    const perPage = queryData.perPage || 10

    try {
      // 1. Obtenemos el paginador con las cajas y sus sesiones abiertas pre-cargadas
      const cashRegistersPaginator = await CashRegister.withCompanyFilter(companyId)
        .preload('sessions', (sessionQuery) => {
          sessionQuery.where('status', 'open')
        })
        .paginate(page, perPage)

      // 2. Mapeamos sobre las INSTANCIAS del modelo usando toJSON()
      const transformedData = cashRegistersPaginator.toJSON().data.map((registerInstance) => {

        // Obtenemos la sesión pre-cargada de la instancia del modelo
        const openSessionInstance = registerInstance.$preloaded.sessions[0]

        let sessionInfo

        if (openSessionInstance) {
          // Si existe una sesión abierta...
          sessionInfo = {
            isOpen: true,
            idCashRegisterSession: openSessionInstance.id,
            // Serializamos la sesión para obtener un JSON limpio
            cashRegisterInfo: openSessionInstance.serialize(),
          }
        } else {
          // Si no hay sesión abierta...
          sessionInfo = {
            isOpen: false,
            idCashRegisterSession: null,
          }
        }

        // 3. LA CORRECCIÓN CLAVE:
        // Serializamos la instancia de la caja para obtener un objeto limpio
        // y luego le añadimos nuestro objeto `sessionInfo`.
        return {
          ...registerInstance.serialize(), // <-- ESTO ES LO QUE CAMBIA
          cashRegisterSession: sessionInfo,
        }
      })

      // 4. Devolvemos la metadata del paginador original junto con nuestros datos ya transformados.
      return response.ok({
        meta: cashRegistersPaginator.getMeta(),
        data: transformedData,
      })

    } catch (error) {
      console.log(error)
      return response.internalServerError({
        message: 'Failed to fetch cash registers.',
        error: error.message,
      })
    }
  }
  /**
  * Create a new cashRegister for the authenticated user's company.
  */
  async store({ request, response, companyId }: HttpContext) {
    try {
      // Crear el validador con el companyId del contexto
      const validator = createCashRegisterValidatorWithCompany(companyId)
      const payload = await request.validateUsing(validator)

      const cashRegisterData = {
        ...payload,
        companyId,
      }

      const cashRegister = await CashRegister.create(cashRegisterData)

      return response.created(cashRegister)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A Cash Register with the name "${request.input('name')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while creating the Cash Register.',
        error: error.message,
      })
    }
  }

  /**
    * Show a specific cashRegister (only from user's company).
    */
  async show({ params, response, companyId }: HttpContext) {
    try {
      const table = await CashRegister.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      return response.ok(table)
    } catch (error) {
      return response.notFound({
        message: `Cash Register with ID ${params.id} not found.`,
      })
    }
  }


  /**
  * Update an existing cashRegister for the authenticated user's company.
  */
  async update({ request, response, params, companyId }: HttpContext) {
    try {
      // Crear el validador con el companyId del contexto
      const validator = updateCashRegisterValidatorWithCompany(companyId)
      const payload = await request.validateUsing(validator)

      const cashRegister = await CashRegister.query()
        .where('id', params.id)
        .where('company_id', companyId)
        .firstOrFail()

      await cashRegister.merge(payload).save()

      return response.ok(cashRegister)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          message: 'Cash Register not found or does not belong to your company.'
        })
      }
      return response.internalServerError({
        message: 'An error occurred while updating the Cash Register.',
        error: error.message,
      })
    }
  }

  /**
   * Delete a specific cashRegister (only from user's company).
   */
  async destroy({ params, response, companyId }: HttpContext) {
    // Iniciar una transacción para garantizar la atomicidad de la operación
    const trx = await db.transaction()

    try {
      // 1. Buscar la caja registradora a desactivar
      const cashRegister = await CashRegister.query({ client: trx })
        .where('id', params.id)
        .where('companyId', companyId)
        .firstOrFail()

      // 2. VALIDACIÓN: Verificar si existe una sesión abierta para esta caja
      const openSession = await CashRegisterSession.query({ client: trx })
        .where('cashRegisterId', cashRegister.id)
        .where('status', 'open') // La condición clave: buscar sesiones 'abiertas'
        .first() // Solo necesitamos saber si existe al menos una

      // 3. Si se encuentra una sesión abierta, impedir la desactivación
      if (openSession) {
        await trx.rollback() // Revertir la transacción
        return response.conflict({ // Usamos el código 409 Conflict
          success: false,
          message: 'No se puede desactivar la caja. Tiene una sesión activa que debe ser cerrada primero.',
        })
      }

      // 4. Si no hay sesiones abiertas, proceder con la desactivación
      cashRegister.isActive = false
      await cashRegister.save()

      // 5. Confirmar la transacción
      await trx.commit()

      // 6. Devolver una respuesta exitosa
      return response.ok({
        success: true,
        message: 'Caja registradora desactivada exitosamente.',
      })
    } catch (error) {
      // En caso de cualquier error, revertir la transacción
      await trx.rollback()

      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          success: false,
          message: `La caja registradora con ID ${params.id} no fue encontrada.`,
        })
      }
      return response.internalServerError({
        success: false,
        message: 'Ocurrió un error al desactivar la caja registradora.',
        error: error.message,
      })
    }
  }
}