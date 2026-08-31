import Product from '#models/product'
import { createProductValidator, updateProductValidator } from '#validators/productsvalidator'
import type { HttpContext } from '@adonisjs/core/http'
import { cuid } from '@adonisjs/core/helpers'
import cache from '@adonisjs/cache/services/main'

export default class ProductsController {
  /**
     * List all products for the authenticated user's company.
     */
  async index({ response, companyId, getQueryData }: HttpContext) {
    const queryData = getQueryData() // Ya incluye company_id automáticamente
    const page = queryData.page || 1
    const perPage = queryData.perPage || 10
    // Normalizamos los filtros para usarlos en la clave de la caché
    const categoryFilter = queryData.categoryIsActive === '1' ? 'active' : 'all'
    const productFilter = queryData.productIsActive === '1' ? 'active' : 'all'

    // ✅ PASO 1: Definir el namespace y la clave de caché única
    const namespaceKey = `products:${companyId}`
    const cacheKey = `page:${page}:perPage:${perPage}:catFilter:${categoryFilter}:prodFilter:${productFilter}`

    try {
      // ✅ PASO 2: Envolver la lógica en cache.getOrSet usando el namespace
      const products = await cache.namespace(namespaceKey).getOrSet({
        key: cacheKey,
        factory: async () => {
          console.log(`-- CACHE MISS: [${namespaceKey}] Buscando en BD para la clave: ${cacheKey}`)
          let query = Product.withCompanyFilter(companyId)

          if (categoryFilter === 'active') {
            query = query.whereHas('category', (categoryQuery) => {
              categoryQuery.where('is_active', true) // Usar snake_case
            })
          }

          if (productFilter === 'active') {
            query = query.where('is_active', true) // Usar snake_case
          }

          const paginatedResult = await query
            .preload('category', (query) => query.select('id', 'name', 'is_active'))
            .preload('modifierGroupAssignments', (assignmentQuery) =>
              assignmentQuery.select('id', 'product_id'),
            )
            .orderBy('name', 'asc')
            .paginate(page, perPage)

          return paginatedResult.toJSON() // Serializar para la caché
        },
        ttl: '10m' // Los productos pueden cambiar, un TTL de 10 minutos es razonable
      })

      return response.ok(products)
    } catch (error) {
      return response.internalServerError({
        message: 'Failed to fetch products.',
        error: error.message,
      })
    }
  }

  /**
   * Create a new product for the authenticated user's company.
   */
  async store({ request, response, companyId }: HttpContext) {
    try {
      // 1. Validar la petición. 'image' será undefined si no se envía.
      const { image, ...payload } = await request.validateUsing(createProductValidator)

      let imageUrl: string | null = null // Variable para guardar la ruta de la imagen

      // 2. ✅ Ejecutar la lógica de la imagen SÓLO si existe
      if (image) {
        const fileName = `${cuid()}.${image.extname}`
        const securePath = `products/${companyId}/${fileName}`

        await image.moveToDisk(securePath)

        // Si la imagen se movió con éxito, guardamos su ruta
        imageUrl = securePath
      }

      // 3. Crear el producto en la base de datos
      const product = await Product.create({
        ...payload,
        companyId,
        imageUrl: imageUrl, // Se guardará la ruta o null si no se subió imagen
      })

      // ✅ PASO 3: Invalidar la caché de productos para esta compañía
      const namespaceKey = `products:${companyId}`
      await cache.namespace(namespaceKey).clear()
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey}`)

      return response.created(product)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A product with the name "${request.input('name')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while creating the product.',
        error: error.message,
      })
    }
  }

  /**
  * Show a specific category (only from user's company).
  */
  async show({ params, response, companyId }: HttpContext) {
    const cacheKey = `product:${params.id}`
    try {
      const product = await cache.getOrSet({
        key: cacheKey,
        factory: async () => {
          console.log(`-- CACHE MISS: Buscando producto #${params.id} en la BD.`)
          const productFromDb = await Product.withCompanyFilter(companyId)
            .where('id', params.id)
            .preload('category')
            .firstOrFail()
          return productFromDb.toJSON()
        },
        ttl: '1h'
      })

      return response.ok(product)
    } catch (error) {
      return response.notFound({
        message: `Product with ID ${params.id} not found.`,
      })
    }
  }

  /**
 * Update a specific product (only from user's company).
 */
  async update({ params, request, response, companyId }: HttpContext) {
    try {
      const product = await Product.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      // 1. Validar la petición. 'image' será undefined si no se envía.
      const { image, ...payload } = await request.validateUsing(updateProductValidator)

      let imageUrl: string | null = null // Variable para guardar la nueva ruta de la imagen

      // 2. ✅ Ejecutar la lógica de la imagen SÓLO si existe una nueva imagen
      if (image) {
        // 🗑️ Eliminar la imagen anterior si existe
        if (product.imageUrl) {
          try {
            const drive = (await import('@adonisjs/drive/services/main')).default
            await drive.use('fs').delete(product.imageUrl)
          } catch (deleteError) {
            // Log del error pero no detener la ejecución
            console.warn('Could not delete previous image:', deleteError.message)
          }
        }

        // 📤 Subir la nueva imagen
        const fileName = `${cuid()}.${image.extname}`
        const securePath = `products/${companyId}/${fileName}`

        await image.moveToDisk(securePath)

        // Si la imagen se movió con éxito, guardamos su ruta
        imageUrl = securePath
      }

      // 3. Preparar el payload para la actualización
      const cleanPayload = Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [key, value === null ? undefined : value])
      )

      // 4. Si se subió una nueva imagen, incluirla en el payload
      if (imageUrl !== null) {
        cleanPayload.imageUrl = imageUrl
      }

      // 5. Actualizar el producto
      product.merge(cleanPayload)
      await product.save()

      // ✅ PASO 3: Invalidar el namespace y la clave individual del producto
      const namespaceKey = `products:${companyId}`
      const individualCacheKey = `product:${params.id}`
      await cache.namespace(namespaceKey).clear()
      await cache.delete({ key: individualCacheKey })
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey} and key: ${individualCacheKey}`)

      return response.ok(product)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          message: `Product with ID ${params.id} not found.`,
        })
      }
      if (error.code === 'ER_DUP_ENTRY') {
        return response.conflict({
          message: `A product with the name "${request.input('name')}" already exists for your company.`,
        })
      }
      return response.internalServerError({
        message: 'An error occurred while updating the product.',
        error: error.message,
      })
    }
  }

  /**
   * Deactivates a specific product (only from user's company).
   * This is a soft delete.
   */
  async destroy({ params, response, companyId }: HttpContext) {
    try {
      const product = await Product.withCompanyFilter(companyId)
        .where('id', params.id)
        .firstOrFail()

      // 1. Cambia el estado de 'isActive' a falso
      product.isActive = false

      // 2. Guarda los cambios en la base de datos
      await product.save()

      // ✅ PASO 3: Invalidar el namespace y la clave individual
      const namespaceKey = `products:${companyId}`
      const individualCacheKey = `product:${params.id}`
      await cache.namespace(namespaceKey).clear()
      await cache.delete({ key: individualCacheKey })
      console.log(`-- CACHE CLEARED for namespace: ${namespaceKey} and key: ${individualCacheKey}`)

      // 3. Devuelve una respuesta exitosa
      return response.ok({
        success: true,
        message: 'Product deactivated successfully.',
      })
    } catch (error) {
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({
          success: false,
          message: `Product with ID ${params.id} not found.`,
        })
      }
      return response.internalServerError({
        success: false,
        message: 'An error occurred while deactivating the product.',
        error: error.message,
      })
    }
  }

  async serveImage({ params, response, auth, companyId }: HttpContext) {
    try {
      const productId = params.id
      const user = auth.user

      if (user) {
        // 1. Buscar producto y validar que pertenece a la empresa del usuario
        const product = await Product.withCompanyFilter(companyId)
          .where('id', productId)
          .firstOrFail()

        if (!product.imageUrl) {
          return response.notFound({ message: 'Image not found for this product' })
        }

        // 2. Verificar existencia del archivo

        const drive = (await import('@adonisjs/drive/services/main')).default

        const exists = await drive.use('fs').exists(product.imageUrl)
        if (!exists) {
          return response.notFound({ message: 'Image file not found on server' })
        }

        // 3. Retornar el stream del archivo
        const stream = await drive.use('fs').getStream(product.imageUrl)
        // Detectar tipo de archivo automáticamente
        const ext = product.imageUrl.split('.').pop()
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png'
        response.header('Content-Type', mime)
        response.stream(stream)
      }

    } catch (error) {
      return response.internalServerError({
        message: 'Could not serve product image',
        error: error.message,
      })
    }
  }
}
