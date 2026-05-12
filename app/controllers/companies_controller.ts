import type { HttpContext } from '@adonisjs/core/http'
import Company from '#models/company'
import { createCompanyValidator, updateCompanyValidator } from '#validators/company'
import db from '@adonisjs/lucid/services/db'
import Location from '#models/location'
import Role from '#models/role'
import User from '#models/user'
import env from '#start/env'
import { DateTime } from 'luxon'

export default class CompaniesController {
  /**
   * Muestra una lista paginada de todas las compañías.
   */
  async index({ response, request }: HttpContext) {
    // Obtiene el número de página y el límite por página desde la URL, con valores por defecto.    
    const page = request.input('page', 1)
    const perPage = request.input('perPage', 10)

    try {
      // Realiza la consulta a la base de datos de forma paginada.
      const companies = await Company.query().paginate(page, perPage)
      return response.ok(companies)
    } catch (error) {
      // Manejo de errores en caso de que falle la consulta.
      return response.internalServerError({
        message: 'No se pudieron obtener las compañías.',
        error: error.message,
      })
    }
  }

  /**
   * Crea y guarda una nueva compañía en la base de datos.
   */
  async store({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(createCompanyValidator)
      const company = await Company.create(payload)
      return response.created(company)
    } catch (error) {
      // Si es error de validación de Vine
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }

      // Si es cualquier otro error inesperado
      return response.internalServerError({
        message: 'An error occurred while creating the company.',
        error: error.message,
      })
    }
  }

  /**
   * Muestra una compañía específica por su ID.
   */
  async show({ params, response }: HttpContext) {
    try {
      // Busca la compañía por su ID. Carga las relaciones para dar más contexto.
      const company = await Company.query().where('id', params.id).preload('locations').firstOrFail()

      return response.ok(company)
    } catch (error) {
      // Si no se encuentra la compañía, devuelve un error 404 (Not Found).
      return response.notFound({ message: `Copmany with ID ${params.id} no found.` })
    }
  }

  /**
   * Actualiza los datos de una compañía específica.
   */
  async update({ params, request, response }: HttpContext) {
    try {
      const company = await Company.findOrFail(params.id)

      const payload = await request.validateUsing(updateCompanyValidator)

      company.merge(payload)
      await company.save()

      return response.ok(company)
    } catch (error) {
      if (error.code === 'E_VALIDATION_ERROR' || error.code === 'E_VALIDATION_FAILURE') {
        return response.unprocessableEntity({ errors: error.messages })
      }

      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: `Company with ID ${params.id} not found.` })
      }

      return response.internalServerError({
        message: 'An error occurred while updating the company.',
        error: error.message,
      })
    }
  }

  /**
   * Elimina una compañía de la base de datos.
   */
  async destroy({ params, response }: HttpContext) {
    try {
      // Busca la compañía que se va a eliminar.
      const company = await Company.findOrFail(params.id)

      // Elimina el registro.
      await company.delete()

      // Devuelve una respuesta vacía con estado 204 (No Content) para indicar éxito.
      return response.noContent()
    } catch (error) {
      // Si no se encuentra, devuelve un 404.
      if (error.code === 'E_ROW_NOT_FOUND') {
        return response.notFound({ message: `Compañía con ID ${params.id} no encontrada.` })
      }
      // Otros errores.
      return response.internalServerError({
        message: 'Ocurrió un error al eliminar la compañía.',
        error: error.message,
      })
    }
  }

  async registerNewCompany({ request, response }: HttpContext) {
    // 1. Validar el header 'secret_word'
    const secretWordHeader = request.header('X-API-Key')
    const expectedSecret = env.get('SECRET_WORD')

    if (secretWordHeader !== expectedSecret) {
      return response.status(403).json({
        success: false,
        message: 'Not allowed.',
      })
    }

    const payload = request.only([
      'company',
      'location',
      'users'
    ])

    // ✅ 2. Separa el flag 'isDemo' del resto de los datos de la compañía
    // Si 'isDemo' no viene, se asume 'false' por defecto (plan pagado).
    const { isDemo = false, ...companyData } = payload.company

    const rolesToCreate = [
      { name: 'Super Administrador', code: 'super_admin', description: 'Acceso total al sistema' },
      { name: 'Administrador', code: 'admin', description: 'Gestión administrativa' },
      { name: 'Cajero', code: 'cashier', description: 'Gestión de ventas y caja' },
      { name: 'Cocina', code: 'kitchen', description: 'Gestión de pedidos en cocina' },
      { name: 'Gerente', code: 'manager', description: 'Supervisión general' },
      { name: 'Mesero', code: 'waiter', description: 'Toma y gestión de pedidos' }
    ]

    const trx = await db.transaction()

    try {

      // ✅ 3. Declara la variable para la fecha de expiración
      let subscriptionExpiresAt: DateTime;

      // ✅ 4. Lógica condicional para calcular la fecha
      if (isDemo) {
        // Caso DEMO: 7 días de prueba, expirando a las 7 AM del octavo día.
        subscriptionExpiresAt = DateTime.now()
          .plus({ days: 7 })
          .startOf('day')
          .plus({ hours: 7 });
      } else {
        // Caso PAGADO: Se activa por 1 mes completo.
        // Suma un mes a la fecha y hora actual.
        subscriptionExpiresAt = DateTime.now().plus({ months: 1 });
      }

      // 5. Prepara el payload final para crear la empresa
      const companyPayload = {
        ...companyData, // Usa los datos de la empresa sin el flag 'isDemo'
        subscription_status: 'active',
        subscriptionExpiresAt: subscriptionExpiresAt,
      };

      // 1. Crear la empresa
      const company = await Company.create(companyPayload, { client: trx })

      // 2. Crear la sucursal principal
      const location = await Location.create({
        ...payload.location,
        companyId: company.id
      }, { client: trx })

      // 3. Crear los roles
      const roleMap = {} as Record<string, number>
      for (const roleData of rolesToCreate) {
        const role = await Role.create({
          ...roleData,
          companyId: company.id,
          isActive: true
        }, { client: trx })
        roleMap[role.code] = role.id
      }

      // 4. Crear usuarios
      const createdUsers = []
      for (const userData of payload.users) {
        const user = await User.create({
          username: userData.username,
          password: userData.password,
          fullName: userData.full_name,
          companyId: company.id,
          locationId: location.id,
          roleId: roleMap[userData.role_code]
        }, { client: trx })
        createdUsers.push(user)
      }

      await trx.commit()

      return response.status(201).json({
        success: true,
        message: 'Empresa, roles, ubicación y usuarios creados exitosamente',
        data: {
          company,
          location,
          roles: roleMap,
          users: createdUsers.map(user => ({
            id: user.id,
            username: user.username,
            fullName: user.fullName
          }))
        }
      })
    } catch (error) {
      await trx.rollback()
      console.error(error)
      return response.status(500).json({
        success: false,
        message: 'Error al crear la empresa',
        error: error.message
      })
    }

  }
}
