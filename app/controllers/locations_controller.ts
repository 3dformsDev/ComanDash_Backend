import type { HttpContext } from '@adonisjs/core/http'
import Location from '#models/location'
import { createLocationValidator, updateLocationValidator } from '#validators/location'
import Company from '#models/company'

export default class LocationsController {

  /**
     * List all locations for the authenticated user's company.
     */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData()
    const page = queryData.page || 1
    const perPage = queryData.perPage || 10

    try {
      // Agregamos .preload() para cada relación que queremos cargar
      const locations = await Location
        .withCompanyFilter(companyId)
        .preload('cashRegisters', (query: any) => {
          query.select(['id', 'name'])
        }) // Precarga la relación de cajas registradoras
        .preload('tables')        // Precarga la relación de mesas
        .paginate(page, perPage)

      return response.ok(locations)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch locations.',
        error: error.message,
      })
    }
  }

  /**
   * Create a new location for the authenticated user's company.
   */
  async store({ request, response, companyId }: HttpContext) {
    try {
      // Verificar que la compañía pueda crear más sucursales
      const companyFound = await Company.find(companyId);

      if (!companyFound) {
        return response.badRequest({ message: 'Compañía no encontrada' });
      }

      // Contar las sucursales existentes
      const result = await Location.query()
        .where('company_id', companyId)
        .count('* as total');
      
      const total = result[0].$extras.total as number;

      console.log('Sucursales existentes:', total);

      const isAvailableToCreateMoreLocations = Number(total) < companyFound.maxLocations;
      if (!isAvailableToCreateMoreLocations) {
        return response.badRequest({
          message: `You have reached the branch limit (${companyFound.maxLocations}), change the suscription`,
        });
      }

      const payload = await request.validateUsing(createLocationValidator)
      // const data = getRequestData() // Ya incluye company_id y user_id

      const location = await Location.create({
        ...payload,
        companyId, // Automático del contexto del usuario
      })

      return response.created(location)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A location with the name "${request.input('name')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while creating the location.',
        error: error.message,
      })
    }
  }

  /**
   * Show a specific location (only from user's company).
   */
  async show({ params, response, companyId }: HttpContext) {
    try {
      const location = await Location.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      return response.ok(location)
    } catch (error) {
      return response.notFound({
        message: `Location with ID ${params.id} not found.`,
      })
    }
  }

  /**
   * Update a specific location (only from user's company).
   */
  async update({ params, request, response, companyId }: HttpContext) {
    try {
      const location = await Location.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      const payload = await request.validateUsing(updateLocationValidator)

      location.merge(payload)
      await location.save()

      return response.ok(location)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          message: `Location with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while updating the location.',
        error: error.message,
      })
    }
  }

  /**
   * Delete a specific location (only from user's company).
   */
  async destroy({ params, response, companyId }: HttpContext) {
    try {
      const location = await Location.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      await location.delete()

      return response.noContent()
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          message: `Location with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while deleting the location.',
        error: error.message,
      })
    }
  }
}