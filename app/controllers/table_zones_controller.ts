import Table from '#models/table'
import TableZone from '#models/table_zone'
import { createTableZoneValidator, updateTableZoneValidator } from '#validators/table_zone'
import cache from '@adonisjs/cache/services/main'
import type { HttpContext } from '@adonisjs/core/http'

export default class TableZonesController {
  async index({ request, response, companyId, locationId }: HttpContext) {
    if (!locationId) {
      return response.badRequest({ message: 'No hay una sede activa para consultar las zonas.' })
    }

    const onlyActive = request.input('zoneIsActive') === '1'
    const page = Number(request.input('page') || 1)
    const perPage = Math.min(Number(request.input('perPage') || 100), 999)

    try {
      const query = TableZone.withCompanyFilter(companyId)
        .where('location_id', locationId)
        .orderBy('display_order', 'asc')
        .orderBy('name', 'asc')

      if (onlyActive) {
        query.where('is_active', true)
      }

      return response.ok(await query.paginate(page, perPage))
    } catch (error) {
      return response.internalServerError({
        message: 'No se pudieron consultar las zonas.',
        error: error.message,
      })
    }
  }

  async show({ params, response, companyId, locationId }: HttpContext) {
    if (!locationId) {
      return response.badRequest({ message: 'No hay una sede activa para consultar la zona.' })
    }

    try {
      const zone = await TableZone.withCompanyFilter(companyId)
        .where('location_id', locationId)
        .where('id', params.id)
        .firstOrFail()

      return response.ok(zone)
    } catch (error) {
      return response.notFound({ message: 'La zona no existe en esta sede.' })
    }
  }

  async store({ request, response, companyId, locationId }: HttpContext) {
    if (!locationId) {
      return response.badRequest({ message: 'No hay una sede activa para crear la zona.' })
    }

    try {
      const payload = await request.validateUsing(createTableZoneValidator)
      const zone = await TableZone.create({ ...payload, companyId, locationId })
      await this.clearTableCache(companyId)
      return response.created(zone)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({ message: 'Ya existe una zona con ese nombre en esta sede.' })
      }
      return response.internalServerError({
        message: 'No se pudo crear la zona.',
        error: error.message,
      })
    }
  }

  async update({ params, request, response, companyId, locationId }: HttpContext) {
    if (!locationId) {
      return response.badRequest({ message: 'No hay una sede activa para actualizar la zona.' })
    }

    try {
      const zone = await TableZone.withCompanyFilter(companyId)
        .where('location_id', locationId)
        .where('id', params.id)
        .firstOrFail()
      const payload = await request.validateUsing(updateTableZoneValidator)

      zone.merge(payload)
      await zone.save()

      if (payload.name) {
        await Table.withCompanyFilter(companyId)
          .where('location_id', locationId)
          .where('zone_id', zone.id)
          .update({ zone: zone.name })
      }

      await this.clearTableCache(companyId)
      return response.ok(zone)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({ message: 'Ya existe una zona con ese nombre en esta sede.' })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'La zona no existe en esta sede.' })
      }
      return response.internalServerError({
        message: 'No se pudo actualizar la zona.',
        error: error.message,
      })
    }
  }

  async destroy({ params, response, companyId, locationId }: HttpContext) {
    if (!locationId) {
      return response.badRequest({ message: 'No hay una sede activa para desactivar la zona.' })
    }

    try {
      const zone = await TableZone.withCompanyFilter(companyId)
        .where('location_id', locationId)
        .where('id', params.id)
        .firstOrFail()
      const assignedTables = await Table.withCompanyFilter(companyId)
        .where('location_id', locationId)
        .where('zone_id', zone.id)
        .count('* as total')

      if (Number(assignedTables[0].$extras.total) > 0) {
        return response.conflict({
          message: 'No puedes quitar una zona que todavía tiene mesas asociadas.',
        })
      }

      zone.isActive = false
      await zone.save()
      await this.clearTableCache(companyId)
      return response.ok(zone)
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: 'La zona no existe en esta sede.' })
      }
      return response.internalServerError({
        message: 'No se pudo desactivar la zona.',
        error: error.message,
      })
    }
  }

  private async clearTableCache(companyId: number) {
    await cache.namespace(`tables:${companyId}`).clear()
  }
}
