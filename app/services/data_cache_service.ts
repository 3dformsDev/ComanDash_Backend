import Category from "#models/category"
import PaymentMethod from "#models/payment_method"
import Product from "#models/product"
import cache from '@adonisjs/cache/services/main'

export class DataCacheService {
  /**
   * 📂 Obtiene todas las categorías de una compañía, usando la caché.
   */
  async getCategories(companyId: number): Promise<Category[]> {
    const cacheKey = `categories:${companyId}`

    return cache.getOrSet({
      key: cacheKey,
      factory: async () => {
        console.log(`-- CACHE MISS: Buscando categorías para Cia #${companyId} en la BD.`)
        const categories = await Category.query().where('company_id', companyId)
        // Es crucial serializar los modelos de Lucid antes de cachearlos.
        return categories.map(c => c.toJSON())
      },
      // Las categorías cambian muy poco, un TTL (Time To Live) largo es adecuado.
      ttl: '1h'
    }) as Promise<Category[]>
  }

  /**
   * 📦 Obtiene todos los productos de una compañía, usando la caché.
   */
  async getProducts(companyId: number): Promise<Product[]> {
    const cacheKey = `products:${companyId}`

    return cache.getOrSet({
      key: cacheKey,
      factory: async () => {
        console.log(`-- CACHE MISS: Buscando productos para Cia #${companyId} en la BD.`)
        const products = await Product.query().where('company_id', companyId)
        return products.map(p => p.toJSON())
      },
      // Los productos pueden cambiar más a menudo, usamos un TTL más corto.
      ttl: '10m'
    }) as Promise<Product[]>
  }

  /**
  * 💳 Obtiene todos los métodos de pago de una compañía, usando la caché.
  */
  async getPaymentMethods(companyId: number): Promise<PaymentMethod[]> {
    const cacheKey = `payment_methods:${companyId}`

    return cache.getOrSet({
      key: cacheKey,
      factory: async () => {
        console.log(`-- CACHE MISS: Buscando métodos de pago para Cia #${companyId} en la BD.`)
        const methods = await PaymentMethod.query().where('company_id', companyId)
        return methods.map(m => m.toJSON())
      },
      // Estos datos son casi estáticos, un TTL muy largo es ideal.
      ttl: '24h'
    }) as Promise<PaymentMethod[]>
  }

}

export default new DataCacheService()