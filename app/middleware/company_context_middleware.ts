import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'

export default class CompanyContextMiddleware {
  async handle(
    ctx: HttpContext, 
    next: NextFn, 
    options: { guard?: string } = {}
  ) {
    const { auth, response, request } = ctx
    const guardName = options.guard || 'api'

    try {
      // 1. Verificar autenticación con el guard específico
      const authGuard = auth.use(guardName as 'api')
      await authGuard.check()
      
      const user = authGuard.user
      if (!user) {
        return response.status(401).json({
          error: 'No autenticado',
          message: 'Usuario no encontrado'
        })
      }

      // 2. Obtener company_id directamente del usuario
      const companyId = user.companyId
      
      if (!companyId) {
        return response.status(400).json({
          error: 'Company ID requerido',
          message: 'El usuario no tiene una empresa asignada'
        })
      }

      // 3. Verificar que el usuario esté activo
      if (!user.isActive) {
        return response.status(403).json({
          error: 'Usuario inactivo',
          message: 'Tu cuenta está desactivada. Contacta al administrador.'
        })
      }

      // 4. Agregar información al contexto
      ctx.companyId = companyId
      ctx.locationId = user.locationId // También disponible si la necesitas      
      ctx.authGuard = guardName
      ctx.currentUser = user
      
      // 5. Helpers para obtener datos con company_id automático
      ctx.getRequestData = () => {
        const data = request.all()
        return { 
          ...data, 
          company_id: companyId,
          user_id: user.id // Por si también lo necesitas
        }
      }
      
      ctx.getQueryData = () => {
        const qs = request.qs()
        return { 
          ...qs, 
          company_id: companyId 
        }
      }

      // 6. Helper para verificar permisos fácilmente
      ctx.checkPermission = async (functionalityCode: string, action: 'can_access' | 'can_create' | 'can_read' | 'can_update' | 'can_delete' = 'can_access') => {
        return await user.hasPermission(functionalityCode, action)
      }

      // 7. Helper para obtener permisos del usuario
      ctx.getUserPermissions = async () => {
        return await user.getPermissions()
      }

    } catch (error) {
      return response.status(401).json({
        error: 'Autenticación fallida',
        message: `Error con guard '${guardName}': ${error.message}`
      })
    }

    await next()
  }
}