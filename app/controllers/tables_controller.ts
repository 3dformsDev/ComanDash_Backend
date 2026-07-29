import Order from '#models/order'
import Table from '#models/table'
import { io } from '#start/socket'
import { createTableValidatorWithCompany, updateTableValidatorWithCompany } from '#validators/table'
import type { HttpContext } from '@adonisjs/core/http'
import cache from '@adonisjs/cache/services/main'

export default class TablesController {
  /**
     * List all tables for the authenticated user's company.
     */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData() // Ya incluye company_id automáticamente
    const page = queryData.page || 1
    const perPage = queryData.perPage || 10
    const isActiveFilter = queryData.tableIsActive === '1' || queryData.tableIsActive === true ? 'active' : 'all'

    // ✅ PASO 1: Definir el namespace y la clave de caché
    const namespaceKey = `tables:${companyId}`
    const cacheKey = `page:${page}:perPage:${perPage}:filter:${isActiveFilter}`

    try {
      // ✅ PASO 2: Envolver la lógica en cache.getOrSet usando el namespace
      const tables = await cache.namespace(namespaceKey).getOrSet({
        key: cacheKey,
        factory: async () => {
          console.log(`-- CACHE MISS: [${namespaceKey}] Buscando en BD para la clave: ${cacheKey}`)

          let query = Table.withCompanyFilter(companyId)

          if (isActiveFilter === 'active') {
            query = query.where('is_active', true)
          }

          const paginatedResult = await query.orderByRaw("(number REGEXP '^[0-9]+$') DESC, CAST(number AS UNSIGNED) ASC, number ASC").paginate(page, perPage)
          return paginatedResult.toJSON() // Serializar para la caché
        },
        ttl: '1h' // Las mesas cambian muy poco, un TTL largo es adecuado
      })

      return response.ok(tables)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch tables.',
        error: error.message,
      })
    }
  }

  /**
   * Create a new table for the authenticated user's company.
   */
  async store({ request, response, companyId }: HttpContext) {
    try {
      // Crear el validador con el companyId del contexto
      const validator = createTableValidatorWithCompany(companyId)
      const payload = await request.validateUsing(validator)

      const table = await Table.create({ ...payload, companyId })

      // ✅ PASO 3: Invalidar la caché de mesas para esta compañía
      const namespaceKey = `tables:${companyId}`
      await cache.namespace(namespaceKey).clear()
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey}`)

      return response.created(table)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A table with the name "${request.input('tableNumber')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while creating the table.',
        error: error.message,
      })
    }
  }

  /**
   * Show a specific category (only from user's company).
   */
  async show({ params, response, companyId }: HttpContext) {
    // Para una sola entidad, el cacheo también es útil
    const cacheKey = `table:${params.id}`
    try {
      const table = await cache.getOrSet({
        key: cacheKey,
        factory: async () => {
          console.log(`-- CACHE MISS: Buscando tabla #${params.id} en la BD.`)
          const tableFromDb = await Table.withCompanyFilter(companyId)
            .where('id', params.id)
            .firstOrFail()
          return tableFromDb.toJSON()
        },
        ttl: '1h'
      })

      return response.ok(table)
    } catch (error) {
      return response.notFound({
        message: `Table with ID ${params.id} not found.`,
      })
    }
  }

  /**
  * Update an existing table for the authenticated user's company.
  */
  async update({ request, response, params, companyId }: HttpContext) {
    try {
      // Crear el validador con el companyId del contexto
      const validator = updateTableValidatorWithCompany(companyId)
      const payload = await request.validateUsing(validator)

      const table = await Table.query()
        .where('id', params.id)
        .where('company_id', companyId)
        .firstOrFail()

      await table.merge(payload).save()

      // ✅ PASO 3: Invalidar el namespace y la clave individual
      const namespaceKey = `tables:${companyId}`
      const individualCacheKey = `table:${params.id}`
      await cache.namespace(namespaceKey).clear()
      await cache.delete({ key: individualCacheKey })
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey} and key: ${individualCacheKey}`)

      return response.ok(table)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          message: 'Table not found or does not belong to your company.'
        })
      }
      return response.internalServerError({
        message: 'An error occurred while updating the table.',
        error: error.message,
      })
    }
  }

  /**
      * Delete a specific table (only from user's company).
      */
  async destroy({ params, response, companyId }: HttpContext) {
    try {
      const table = await Table.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      table.isActive = false

      await table.save()

      // ✅ PASO 3: Invalidar el namespace y la clave individual
      const namespaceKey = `tables:${companyId}`
      const individualCacheKey = `table:${params.id}`
      await cache.namespace(namespaceKey).clear()
      await cache.delete({ key: individualCacheKey })
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey} and key: ${individualCacheKey}`)

      // 3. Devuelve una respuesta exitosa
      return response.ok({
        success: true,
        message: 'Table deactivated successfully.',
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          success: false,
          message: `Table with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        success: false,
        message: 'An error occurred while deactivating the table.',
        error: error.message,
      })
    }
  }

  async releaseTable({ params, response, companyId, locationId }: HttpContext) {
    try {
      const table = await Table.withCompanyFilter(companyId)
        .where('id', params.id)
        .where('locationId', locationId!)
        .where('is_bussy', true)
        .preload('orders', (query) => {
          return query
            .where('id', params.orderId)
            .preload('orderItems', (itemQuery: any) => {
              return itemQuery
                .preload('product', (subQuery: any) => {
                  return subQuery.preload('category')
                })
            })
            .preload('waiter')
            .preload('table');
        })
        .firstOrFail()

      if (!table) {
        return response.badRequest({
          success: false,
          message: `No se encontró una mesa ocupada con ID ${params.id} en esta ubicación.`,
        })
      }

      // ✅ Buscar la orden asociada a esa mesa y ordenId
      await Order.withCompanyFilter(companyId)
        .where('id', params.orderId)
        .where('location_id', locationId!)
        .where('table_id', params.id)
        .update({ isFreedTable: true });

      table.isBussy = false;

      await table.save();

      const updatedOrder = await Order.withCompanyFilter(companyId)
        .where('id', params.orderId)
        .where('location_id', locationId!)
        .where('table_id', params.id)
        .preload('orderItems', (itemQuery: any) => {
          return itemQuery.preload('product', (productQuery: any) => {
            return productQuery.preload('category')
          })
        })
        .preload('waiter')
        .preload('table')
        .preload('payments', (paymentQuery) => {
          paymentQuery.preload('paymentMethod', (paymentMethodQuery) => {
            paymentMethodQuery.select('id', 'name', 'type')
          })
        })
        .preload('adjustments')
        .firstOrFail()

      const roomName = `kitchen_room_${companyId}_${locationId}`
      io.to(roomName).emit('order_updated', updatedOrder)

      io.to(roomName).emit('table_is_free', updatedOrder)

      // ✅ PASO 3: Invalidar la caché después de modificar la mesa
      const namespaceKey = `tables:${companyId}`
      const individualCacheKey = `table:${params.id}`
      await cache.namespace(namespaceKey).clear()
      await cache.delete({ key: individualCacheKey })
      console.log(`-- CACHE CLEARED after releasing table for namespace: ${namespaceKey}`)

      return response.ok(table)

    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          success: false,
          message: `Table with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        success: false,
        message: 'An error occurred while deactivating the table.',
        error: error.message,
      })
    }
  }
}
