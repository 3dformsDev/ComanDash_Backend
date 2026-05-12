import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class PermissionMiddleware {
  /**
   * Middleware para verificar permisos específicos
   * Uso: middleware.permission('functionality.code', 'action')
   */
  async handle(
    { auth, response }: HttpContext,
    next: NextFn,
    options: { functionality: string; action?: string }
  ) {    
    try {
      const user = await auth.getUserOrFail()
      const action = options.action || 'can_access'

      const hasPermission = await user.hasPermission(options.functionality, action as any)
      
      if (!hasPermission) {
        return response.status(403).json({
          success: false,
          message: 'No tienes permisos para realizar esta acción',
          required_permission: {
            functionality: options.functionality,
            action: action
          }
        })
      }

      await next()
    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      })
    }
  }

  /**
   * Middleware para verificar múltiples permisos (debe tener TODOS)
   */
  async requireAll(
    { auth, response }: HttpContext,
    next: NextFn,
    permissions: Array<{ functionality: string; action?: string }>
  ) {
    try {
      const user = await auth.getUserOrFail()
      
      for (const permission of permissions) {
        const action = permission.action || 'can_access'
        const hasPermission = await user.hasPermission(permission.functionality, action as any)
        
        if (!hasPermission) {
          return response.status(403).json({
            success: false,
            message: 'No tienes todos los permisos requeridos',
            missing_permission: {
              functionality: permission.functionality,
              action: action
            }
          })
        }
      }

      await next()
    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      })
    }
  }

  /**
   * Middleware para verificar múltiples permisos (debe tener AL MENOS UNO)
   */
  async requireAny(
    { auth, response }: HttpContext,
    next: NextFn,
    permissions: Array<{ functionality: string; action?: string }>
  ) {
    try {
      const user = await auth.getUserOrFail()
      
      let hasAnyPermission = false
      
      for (const permission of permissions) {
        const action = permission.action || 'can_access'
        const hasPermission = await user.hasPermission(permission.functionality, action as any)
        
        if (hasPermission) {
          hasAnyPermission = true
          break
        }
      }

      if (!hasAnyPermission) {
        return response.status(403).json({
          success: false,
          message: 'No tienes ninguno de los permisos requeridos',
          required_permissions: permissions
        })
      }

      await next()
    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      })
    }
  }

  /**
   * Middleware para verificar si es admin de la empresa
   */
  async requireAdmin(
    { auth, response }: HttpContext,
    next: NextFn
  ) {
    try {
      const user = await auth.getUserOrFail()
      await user.load('role')
      
      // Verificar si el rol tiene código de admin o tiene permisos de gestión total
      const isAdmin = user.role.code === 'admin' || 
                     await user.hasPermission('users.manage') ||
                     await user.hasPermission('roles.manage')
      
      if (!isAdmin) {
        return response.status(403).json({
          success: false,
          message: 'Se requieren privilegios de administrador'
        })
      }

      await next()
    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      })
    }
  }

  /**
   * Middleware para verificar acceso a una ubicación específica
   */
  async requireLocation(
    { auth, response, request }: HttpContext,
    next: NextFn
  ) {
    try {
      const user = await auth.getUserOrFail()
      const requestedLocationId = request.param('locationId') || request.input('location_id')
      
      // Si el usuario no tiene ubicación asignada, debe ser admin
      if (!user.locationId) {
        const isAdmin = await user.hasPermission('locations.manage')
        if (!isAdmin) {
          return response.status(403).json({
            success: false,
            message: 'No tienes acceso a esta ubicación'
          })
        }
      } else {
        // Si tiene ubicación asignada, debe coincidir con la solicitada
        if (requestedLocationId && parseInt(requestedLocationId) !== user.locationId) {
          return response.status(403).json({
            success: false,
            message: 'No tienes acceso a esta ubicación'
          })
        }
      }

      await next()
    } catch (error) {
      return response.status(401).json({
        success: false,
        message: 'Usuario no autenticado'
      })
    }
  }
}