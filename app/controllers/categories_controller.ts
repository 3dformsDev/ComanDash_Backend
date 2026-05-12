import Category from '#models/category'
import { createCategoryValidator, updateCategoryValidator } from '#validators/category'
import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'

export default class CategoriesController {
  /**
    * List all categories for the authenticated user's company.
    */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData()
    const page = queryData.page || 1
    const perPage = queryData.perPage || 10
    const isActiveFilter = queryData.isActive == 1 ? 'active' : 'all'

    // ✅ PASO 1: Definir el "espacio de nombres" para esta compañía
    const namespaceKey = `categories:${companyId}`

    // La clave individual sigue siendo útil para la paginación dentro del namespace
    const cacheKey = `page:${page}:perPage:${perPage}:filter:${isActiveFilter}`

    try {
      // ✅ PASO 2: Usar el namespace para la operación de caché
      const categories = await cache.namespace(namespaceKey).getOrSet({
        key: cacheKey,
        factory: async () => {
          console.log(`-- CACHE MISS: [${namespaceKey}] Buscando en BD para la clave: ${cacheKey}`)
          const categoriesQuery = Category.withCompanyFilter(companyId)
          if (isActiveFilter === 'active') {
            categoriesQuery.where('isActive', 1)
          }
          const paginatedResult = await categoriesQuery.orderBy('name', 'asc').paginate(page, perPage)
          return paginatedResult.toJSON()
        },
        ttl: '5m'
      })

      return response.ok(categories)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch categories.',
        error: error.message,
      })
    }
  }

  /**
   * Create a new category for the authenticated user's company.
   */
  async store({ request, response, companyId }: HttpContext) {
    try {
      const payload = await request.validateUsing(createCategoryValidator)
      // const data = getRequestData() // Ya incluye company_id y user_id

      const category = await Category.create({
        ...payload,
        companyId, // Automático del contexto del usuario
      })

      // ✅ PASO 3: Invalidar (limpiar) la caché para esta compañía
      const namespaceKey = `categories:${companyId}`
      await cache.namespace(namespaceKey).clear()
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey}`)

      return response.created(category)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A category with the name "${request.input('name')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while creating the category.',
        error: error.message,
      })
    }
  }

  /**
  * Show a specific category (only from user's company).
  */
  async show({ params, response, companyId }: HttpContext) {
    try {
      const category = await Category.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      return response.ok(category)
    } catch (error) {
      return response.notFound({
        message: `Category with ID ${params.id} not found.`,
      })
    }
  }

  /**
     * Update a specific category (only from user's company).
     */
  async update({ params, request, response, companyId }: HttpContext) {
    try {
      const category = await Category.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      const payload = await request.validateUsing(updateCategoryValidator)

      category.merge(payload)
      await category.save()

      // ✅ PASO 3: Invalidar (limpiar) la caché para esta compañía
      const namespaceKey = `categories:${companyId}`
      await cache.namespace(namespaceKey).clear()
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey}`)

      return response.ok(category)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          message: `Category with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while updating the category.',
        error: error.message,
      })
    }
  }

  /**
  * Deactivates a specific category (only from user's company).
  * This is a soft delete.
  */
  async destroy({ params, response, companyId }: HttpContext) {
    try {
      const category = await Category.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      // 1. Cambia el estado de 'isActive' a falso
      category.isActive = false

      // 2. Guarda los cambios en la base de datos
      await category.save()

      // ✅ PASO 3: Invalidar (limpiar) la caché para esta compañía
      const namespaceKey = `categories:${companyId}`
      await cache.namespace(namespaceKey).clear()
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey}`)

      // 3. Devuelve una respuesta exitosa
      return response.ok({
        success: true,
        message: 'Category deactivated successfully.',
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          success: false,
          message: `Category with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        success: false,
        message: 'An error occurred while deactivating the category.',
        error: error.message,
      })
    }
  }
}