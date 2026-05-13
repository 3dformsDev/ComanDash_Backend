import type { HttpContext } from '@adonisjs/core/http'
import { errors } from '@adonisjs/auth'
import User from '#models/user'
import Company from '#models/company'
import Location from '#models/location'
import Role from '#models/role'
import { loginValidator, registerValidator } from '#validators/auth_validator'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import DeviceToken from '#models/device_token'
import CashRegisterSession from '#models/cash_registers_session'
import env from '#start/env'

export default class AuthController {
  /**
   * Login del usuario
   */
  async login({ request, response }: HttpContext) {
    try {
      const payload = await request.validateUsing(loginValidator)

      // 2. Buscar la empresa por su business_code
      // Es importante que el validador haga que 'business_code' sea obligatorio.
      const company = await Company.findBy('business_code', payload.business_code);

      // Si la empresa no existe, no debemos continuar.
      if (!company) {
        // Lanzamos el mismo error para no dar pistas a un atacante.
        throw new errors.E_INVALID_CREDENTIALS()
      }

      // --- ✅ INICIO DE LA VALIDACIÓN DE SUSCRIPCIÓN ---
      // Verificamos el estado de la suscripción de la empresa.
      if (company.subscriptionStatus !== 'active') {
        return response.status(403).json({ // Usamos 403 Forbidden, ya que el acceso está denegado.
          success: false,
          message: 'Tu suscripción ha vencido o está inactiva. Por favor, contacta al soporte para renovarla.',
        })
      }

      if (company.subscriptionExpiresAt) {
        if (DateTime.now() > company.subscriptionExpiresAt) {
          return response.status(403).json({ // Usamos 403 Forbidden, ya que el acceso está denegado.
            success: false,
            message: 'Tu suscripción ha vencido o está inactiva. Por favor, contacta al soporte para renovarla.',
          })
        }
      }

      // --- ✅ FIN DE LA VALIDACIÓN DE SUSCRIPCIÓN ---

      // 3. Buscar al usuario por su username DENTRO de la empresa encontrada.
      const user = await User.query()
        .where('company_id', company.id)
        .where('username', payload.username) // o email si también lo permites
        .first();

      // Si el usuario no existe en esa empresa, las credenciales son inválidas.
      if (!user) {
        throw new errors.E_INVALID_CREDENTIALS()
      }

      const isPasswordValid = await hash.verify(user.password, payload.password);
      // Si la contraseña no coincide, las credenciales son inválidas.
      if (!isPasswordValid) {
        throw new errors.E_INVALID_CREDENTIALS()
      }

      // Verificar que el usuario esté activo
      if (!user.isActive) {
        return response.status(401).json({
          success: false,
          message: 'Usuario inactivo',
        })
      }

      // Cargar las relaciones necesarias
      await user.load('company')
      await user.load('location')
      await user.load('role', (roleQuery) => {
        roleQuery.preload('permissions', (permissionQuery) => {
          permissionQuery.preload('functionality')
        })
      })

      // Verificar que el rol esté activo
      if (!user.role.isActive) {
        return response.status(401).json({
          success: false,
          message: 'Rol inactivo. Contacte al administrador',
        })
      }

      // Actualizar último login
      user.lastLoginAt = DateTime.now()
      await user.save()

      // **INICIO DE LA MODIFICACIÓN**
      // Elimina todos los tokens existentes para este usuario, invalidando sesiones anteriores.
      await db.from('auth_access_tokens').where('tokenable_id', user.id).delete()
      // **FIN DE LA MODIFICACIÓN**

      // Generar token nuevo
      const token = await User.accessTokens.create(user, ['*'], {
        expiresIn: '4 hours',
      })

      // Preparar permisos para la respuesta
      const permissions = user.role.permissions.map((permission) => ({
        functionality: {
          id: permission.functionality.id,
          name: permission.functionality.name,
          code: permission.functionality.code,
          module: permission.functionality.module,
          action: permission.functionality.action,
        },
        canAccess: permission.canAccess,
        canCreate: permission.canCreate,
        canRead: permission.canRead,
        canUpdate: permission.canUpdate,
        canDelete: permission.canDelete,
        restrictions: permission.restrictions,
      }))

      return response.ok({
        success: true,
        message: 'Login exitoso',
        data: {
          token: token.value!.release(),
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            isActive: user.isActive,
            lastLoginAt: user.lastLoginAt,
            company: {
              id: user.company.id,
              name: user.company.name,
            },
            location: user.location
              ? {
                id: user.location.id,
                name: user.location.name,
              }
              : null,
            role: {
              id: user.role.id,
              name: user.role.name,
              code: user.role.code,
              description: user.role.description,
            },
            permissions: permissions,
          },
        },
      })
    } catch (error) {
      if (error && error.messages) {
        return response.status(422).json({
          success: false,
          message: 'Error de validación',
          errors: error.messages,
        })
      }

      if (error instanceof errors.E_INVALID_CREDENTIALS) {
        return response.status(401).json({
          success: false,
          message: 'Credenciales inválidas',
        })
      }

      return response.status(500).json({
        success: false,
        message: 'Ocurrió un error inesperado.',
        error: error.message,
      })
    }
  }

  /**
   * Registro de nuevo usuario
   */
  async register({ request, response }: HttpContext) {
    try {

      // 1. Validar el header 'secret_word'
      const secretWordHeader = request.header('X-API-Key')
      const expectedSecret = env.get('SECRET_WORD')

      if (secretWordHeader !== expectedSecret) {
        return response.status(403).json({
          success: false,
          message: 'Not allowed.',
        })
      }

      const payload = await request.validateUsing(registerValidator)
      // --- INICIO DE LA DEPURACIÓN ---
      console.log('Payload validado para crear usuario:', payload)

      // Verificar que la empresa existe
      const company = await Company.find(payload.company_id)
      if (!company) {
        return response.status(404).json({
          success: false,
          message: 'Empresa no encontrada',
        })
      }

      // Verificar que la ubicación existe (si se proporciona)
      if (payload.location_id) {
        const location = await Location.find(payload.location_id)
        if (!location) {
          return response.status(404).json({
            success: false,
            message: 'Ubicación no encontrada',
          })
        }
      }

      // Verificar que el rol existe y pertenece a la empresa
      const role = await Role.query()
        .where('id', payload.role_id)
        .where('company_id', payload.company_id)
        .where('is_active', true)
        .first()

      if (!role) {
        return response.status(404).json({
          success: false,
          message: 'Rol no encontrado o no pertenece a la empresa',
        })
      }

      // Crear el usuario. El hook 'beforeSave' del AuthFinder hasheará la contraseña automáticamente.
      const user = await User.create(payload)

      // Cargar las relaciones
      await user.load('company')
      if (user.locationId) {
        await user.load('location')
      }
      await user.load('role', (roleQuery) => {
        roleQuery.preload('permissions', (permissionQuery) => {
          permissionQuery.preload('functionality')
        })
      })

      // Generar token
      const token = await User.accessTokens.create(user, ['*'], {
        expiresIn: '4 hours',
      })

      // Preparar permisos para la respuesta
      const permissions = user.role.permissions.map((permission) => ({
        functionality: {
          id: permission.functionality.id,
          name: permission.functionality.name,
          code: permission.functionality.code,
          module: permission.functionality.module,
          action: permission.functionality.action,
        },
        canAccess: permission.canAccess,
        canCreate: permission.canCreate,
        canRead: permission.canRead,
        canUpdate: permission.canUpdate,
        canDelete: permission.canDelete,
        restrictions: permission.restrictions,
      }))

      return response.status(201).json({
        success: true,
        message: 'Usuario registrado exitosamente',
        data: {
          token: token.value!.release(),
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            isActive: user.isActive,
            company: {
              id: user.company.id,
              name: user.company.name,
            },
            location: user.location
              ? {
                id: user.location.id,
                name: user.location.name,
              }
              : null,
            role: {
              id: user.role.id,
              name: user.role.name,
              code: user.role.code,
              description: user.role.description,
            },
            permissions: permissions,
          },
        },
      })
    } catch (error) {
      if (error.code === 'E_VALIDATION_FAILURE') {
        return response.status(422).json({
          success: false,
          message: 'Error de validación',
          errors: error.messages,
        })
      }

      if (error.code === '23505') {
        // Error de duplicado en PostgreSQL
        return response.status(409).json({
          success: false,
          message: 'El nombre de usuario o email ya existe para esta empresa',
        })
      }

      return response.status(500).json({
        success: false,
        message: 'Ocurrió un error inesperado.',
        error: error.message,
      })
    }
  }

  /**
   * Cierra la sesión del usuario invalidando el token actual.
   */
  async logout({ auth, locationId, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()

      if (locationId) {
        console.log(user.id);
        console.log(locationId);


        // 2. Buscar y eliminar el registro de DeviceToken que coincida con el usuario Y el token específico.
        // Esto asegura que solo se elimine el token del dispositivo que está cerrando sesión.
        await DeviceToken.query()
          .where('user_id', user.id) // Asumiendo que tu modelo DeviceToken tiene una columna 'user_id'
          .where('location_id', locationId)
          .delete()

        await User.accessTokens.delete(user, user.currentAccessToken.identifier)

        return response.ok({
          success: true,
          message: 'Logout exitoso',
        })
      }

    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Error al cerrar sesión',
        error: error.message,
      })
    }
  }

  /**
   * Obtiene la información completa del usuario autenticado.
   */
  async me({ auth, response, }: HttpContext) {
    try {
      const user = auth.getUserOrFail()

      const openSession = await CashRegisterSession.query()
        .where('user_id', user.id)
        .where('status', 'open')
        .first()

      // Convertimos el resultado en un booleano: true si se encontró una sesión, false si no.
      const cashRegisterSessionIsOpen = !!openSession

      // Carga todas las relaciones necesarias para dar un perfil completo.
      await user.load('company')
      if (user.locationId) {
        await user.load('location')
      }
      await user.load('role', (roleQuery) => {
        roleQuery.preload('permissions', (permissionQuery) => {
          permissionQuery.preload('functionality')
        })
      })

      // Formatea los permisos para una fácil consumición en el frontend.
      const permissions = user.role.permissions.map((permission) => ({
        functionality: {
          id: permission.functionality.id,
          name: permission.functionality.name,
          code: permission.functionality.code,
          module: permission.functionality.module,
          action: permission.functionality.action,
        },
        canAccess: permission.canAccess,
        canCreate: permission.canCreate,
        canRead: permission.canRead,
        canUpdate: permission.canUpdate,
        canDelete: permission.canDelete,
        restrictions: permission.restrictions,
      }))

      return response.ok({
        success: true,
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            isActive: user.isActive,
            lastLoginAt: user.lastLoginAt,
            company: {
              id: user.company.id,
              name: user.company.name,
            },
            location: user.location
              ? {
                id: user.location.id,
                name: user.location.name,
              }
              : null,
            role: {
              id: user.role.id,
              name: user.role.name,
              code: user.role.code,
              description: user.role.description,
            },
            permissions: permissions,
            cashRegisterSessionIsOpen: cashRegisterSessionIsOpen,
          },
        },
      })
    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Usuario no autenticado',
      })
    }
  }

  /**
   * Refresca el token de autenticación.
   */
  async refresh({ auth, response }: HttpContext) {
    try {
      const user = auth.getUserOrFail()

      // Invalida el token viejo.
      await User.accessTokens.delete(user, user.currentAccessToken.identifier)

      // Crea un nuevo token.
      const token = await User.accessTokens.create(user, ['*'], {
        expiresIn: '4 hours',
      })

      // Devuelve el nuevo token y los datos del usuario, igual que en el login.
      return response.ok({
        success: true,
        message: 'Token refrescado exitosamente',
        data: {
          token: token.value!.release(),
        },
      })
    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Error al refrescar el token.',
        error: error.message,
      })
    }
  }
}
