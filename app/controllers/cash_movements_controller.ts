import CashMovement from '#models/cash_movement'
import { createCashMovementValidator } from '#validators/cash_movement'
import type { HttpContext } from '@adonisjs/core/http'

export default class CashMovementsController {
  /**
   * List all cash movements for the authenticated user's company.
   */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData()
    const page = queryData.page || 1
    const perPage = queryData.perPage || 10

    try {
      // Agregamos .preload() para cada relación que queremos cargar
      const cashMovements = await CashMovement
        .withCompanyFilter(companyId)
        .preload('cashRegisterSession') // Precarga la relación de cajas registradoras
        .preload('order')        // Precarga la relación de mesas
        .paginate(page, perPage)

      return response.ok(cashMovements)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch cash Movements.',
        error: error.message,
      })
    }
  }

  /**
    * Create a new location for the authenticated user's company.
    */
  async store({ request, response, companyId, currentUser, cashRegisterSessionId }: HttpContext) {
    try {
      const payload = await request.validateUsing(createCashMovementValidator(companyId))
      const location = await CashMovement.create({
        ...payload,
        companyId,
        userId: currentUser.id,
        cashRegisterSessionId
      })

      return response.created(location)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A cash movement with the name "${request.input('name')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while creating the cash movement.',
        error: error.message,
      })
    }
  }


  /**
   * Show a specific cash movement (only from user's company).
   */
  async show({ params, response, companyId }: HttpContext) {
    try {
      const cashMovement = await CashMovement.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      return response.ok(cashMovement)
    } catch (error) {
      return response.notFound({
        message: `Cash movement with ID ${params.id} not found.`,
      })
    }
  }

  /**
   * Handle form submission for the edit action
   */
  async update({ response }: HttpContext) {
    return response.internalServerError({
      message: 'Failed to fetch cash Movements.',
      error: 'For traceability of the operation, cash movements CANNOT be modified.',
    })
  }

  /**
   * Delete record
   */
  async destroy({ response }: HttpContext) { 
    return response.internalServerError({
      message: 'Failed to fetch cash Movements.',
      error: 'For traceability of the operation, cash movements CANNOT be modified.',
    })
  }
}