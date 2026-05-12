import { BaseModel } from '@adonisjs/lucid/orm'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

export default class TenantBase extends BaseModel {
  /**
   * Método estático para aplicar el filtro de companyId a las consultas.
   * Inicia una nueva consulta filtrada para la compañía especificada.
   */
  static withCompanyFilter<T extends typeof TenantBase>(
    this: T,
    companyId: number
  ): ModelQueryBuilderContract<T> {
    return this.query().where('companyId', companyId)
  }

  /**
   * Método alternativo que preserva mejor el contexto para preloads complejos
   */
  static queryWithCompany<T extends typeof TenantBase>(
    this: T,
    companyId: number
  ) {
    return this.query().where('companyId', companyId)
  }
}