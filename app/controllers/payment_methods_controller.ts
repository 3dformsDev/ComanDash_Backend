import PaymentMethod from '#models/payment_method'
import { createPaymentMethodValidator, updatePaymentMethodValidator } from '#validators/payment_method'
import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'

export default class PaymentMethodsController {
  /**
   * List all paymentMethod for the authenticated user's company.
   */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData()
    const page = queryData.page || 1
    const perPage = queryData.perPage || 10
    const isActiveFilter = queryData.paymentMethodIsActive === '1' || queryData.paymentMethodIsActive === true ? 'active' : 'all'

    // ✅ PASO 1: Definir el namespace y la clave de caché
    const namespaceKey = `payment_methods:${companyId}`
    const cacheKey = `page:${page}:perPage:${perPage}:filter:${isActiveFilter}`

    try {
      // ✅ PASO 2: Envolver la lógica en cache.getOrSet usando el namespace
      const paymentMethods = await cache.namespace(namespaceKey).getOrSet({
        key: cacheKey,
        factory: async () => {
          console.log(`-- CACHE MISS: [${namespaceKey}] Buscando en BD para la clave: ${cacheKey}`)

          let query = PaymentMethod.withCompanyFilter(companyId)

          if (isActiveFilter === 'active') {
            // Asegúrate que el nombre de la columna sea 'is_active'
            query = query.where('is_active', true)
          }

          const paginatedResult = await query.orderBy('name', 'asc').paginate(page, perPage)
          return paginatedResult.toJSON() // Serializar para la caché
        },
        // Los métodos de pago son muy estáticos, un TTL de 24 horas es seguro.
        ttl: '24h'
      })

      return response.ok(paymentMethods)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch payment methods.',
        error: error.message,
      })
    }
  }


  /**
    * Create a new location for the authenticated user's company.
    */
  async store({ request, response, companyId }: HttpContext) {
    try {
      const payload = await request.validateUsing(createPaymentMethodValidator)
      const paymentMethod = await PaymentMethod.create({ ...payload, companyId })

      // ✅ PASO 3: Invalidar la caché
      const namespaceKey = `payment_methods:${companyId}`
      await cache.namespace(namespaceKey).clear()
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey}`)

      return response.created(paymentMethod)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A payment method with the name "${request.input('name')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while creating the payment method.',
        error: error.message,
      })
    }
  }

  /**
    * Show a specific payment method (only from user's company).
    */
  async show({ params, response, companyId }: HttpContext) {
    const cacheKey = `payment_method:${params.id}`
    try {
      const paymentMethod = await cache.getOrSet({
        key: cacheKey,
        factory: async () => {
          console.log(`-- CACHE MISS: Buscando método de pago #${params.id} en la BD.`)
          const methodFromDb = await PaymentMethod.withCompanyFilter(companyId)
            .where('id', params.id)
            .firstOrFail()
          return methodFromDb.toJSON()
        },
        ttl: '24h'
      })

      return response.ok(paymentMethod)
    } catch (error) {
      return response.notFound({
        message: `Payment Method with ID ${params.id} not found.`,
      })
    }
  }

  /**
  * Update a specific location (only from user's company).
  */
  async update({ params, request, response, companyId }: HttpContext) {
    try {
      const paymentMethod = await PaymentMethod.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      const payload = await request.validateUsing(updatePaymentMethodValidator)

      paymentMethod.merge(payload)
      await paymentMethod.save()

      // ✅ PASO 3: Invalidar el namespace y la clave individual
      const namespaceKey = `payment_methods:${companyId}`
      const individualCacheKey = `payment_method:${params.id}`
      await cache.namespace(namespaceKey).clear()
      await cache.delete({ key: individualCacheKey })
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey} and key: ${individualCacheKey}`)

      return response.ok(paymentMethod)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          message: `Payment method with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while updating the payment method.',
        error: error.message,
      })
    }
  }

  /**
     * Delete a specific location (only from user's company).
     */
  async destroy({ params, response, companyId }: HttpContext) {
    try {
      const paymentMethod = await PaymentMethod.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      paymentMethod.isActive = false

      await paymentMethod.save()

      // ✅ PASO 3: Invalidar el namespace y la clave individual
      const namespaceKey = `payment_methods:${companyId}`
      const individualCacheKey = `payment_method:${params.id}`
      await cache.namespace(namespaceKey).clear()
      await cache.delete({ key: individualCacheKey })
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey} and key: ${individualCacheKey}`)

      // 3. Devuelve una respuesta exitosa
      return response.ok({
        success: true,
        message: 'Payment Method deactivated successfully.',
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          success: false,
          message: `Payment Method with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        success: false,
        message: 'An error occurred while deactivating the Payment Method.',
        error: error.message,
      })
    }
  }
}