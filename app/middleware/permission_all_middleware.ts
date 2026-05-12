import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class PermissionAllMiddleware {
  async handle({ auth, response }: HttpContext,
    next: NextFn,
    permissions: Array<{ functionality: string; action?: string }>
  ) {
    try {
      const user = await auth.getUserOrFail()

      for (const permission of permissions) {
        const action = permission.action || 'access'
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
}