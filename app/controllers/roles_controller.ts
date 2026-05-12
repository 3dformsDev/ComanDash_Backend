import type { HttpContext } from '@adonisjs/core/http'
import Role from '#models/role'
import Permission from '#models/permission'
import Functionality from '#models/functionality'
import vine from '@vinejs/vine'

export default class RolesController {
  /**
   * Validator para crear/actualizar roles
   */
  private roleValidator = vine.compile(
    vine.object({
      name: vine.string().trim().minLength(2).maxLength(100),
      description: vine.string().trim().maxLength(255).optional(),
      code: vine.string().trim().minLength(2).maxLength(50),
      is_default: vine.boolean().optional()
    })
  )

  /**
   * Validator para asignar permisos
   */
  private permissionValidator = vine.compile(
    vine.object({
      functionality_id: vine.number().positive(),
      can_access: vine.boolean().optional(),
      can_create: vine.boolean().optional(),
      can_read: vine.boolean().optional(),
      can_update: vine.boolean().optional(),
      can_delete: vine.boolean().optional(),
      restrictions: vine.any().optional()
    })
  )

  /**
   * Listar roles de la empresa
   */
  async index({ auth, response }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()
      
      const roles = await Role.query()
        .where('company_id', user.companyId)
        .preload('permissions', (permissionQuery) => {
          permissionQuery.preload('functionality')
        })
        .orderBy('name')

      return response.json({
        success: true,
        data: roles
      })
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Error al obtener roles'
      })
    }
  }

  /**
   * Obtener un rol específico
   */
  async show({ auth, response, params }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()
      
      const role = await Role.query()
        .where('id', params.id)
        .where('company_id', user.companyId)
        .preload('permissions', (permissionQuery) => {
          permissionQuery.preload('functionality')
        })
        .first()

      if (!role) {
        return response.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        })
      }

      return response.json({
        success: true,
        data: role
      })
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Error al obtener el rol'
      })
    }
  }

  /**
   * Crear nuevo rol
   */
  async store({ auth, request, response }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()
      const payload = await request.validateUsing(this.roleValidator)

      // Verificar que el código no exista en la empresa
      const existingRole = await Role.query()
        .where('company_id', user.companyId)
        .where('code', payload.code)
        .first()

      if (existingRole) {
        return response.status(409).json({
          success: false,
          message: 'Ya existe un rol con este código en la empresa'
        })
      }

      const role = await Role.create({
        ...payload,
        companyId: user.companyId
      })

      return response.status(201).json({
        success: true,
        message: 'Rol creado exitosamente',
        data: role
      })
    } catch (error) {
      return response.status(422).json({
        success: false,
        message: 'Error de validación',
        errors: error.messages || error.message
      })
    }
  }

  /**
   * Actualizar rol
   */
  async update({ auth, request, response, params }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()
      const payload = await request.validateUsing(this.roleValidator)

      const role = await Role.query()
        .where('id', params.id)
        .where('company_id', user.companyId)
        .first()

      if (!role) {
        return response.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        })
      }

      // Verificar que el código no exista en otro rol de la empresa
      if (payload.code !== role.code) {
        const existingRole = await Role.query()
          .where('company_id', user.companyId)
          .where('code', payload.code)
          .where('id', '!=', role.id)
          .first()

        if (existingRole) {
          return response.status(409).json({
            success: false,
            message: 'Ya existe un rol con este código en la empresa'
          })
        }
      }

      role.merge(payload)
      await role.save()

      return response.json({
        success: true,
        message: 'Rol actualizado exitosamente',
        data: role
      })
    } catch (error) {
      return response.status(422).json({
        success: false,
        message: 'Error de validación',
        errors: error.messages || error.message
      })
    }
  }

  /**
   * Eliminar rol
   */
  async destroy({ auth, response, params }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()

      const role = await Role.query()
        .where('id', params.id)
        .where('company_id', user.companyId)
        .first()

      if (!role) {
        return response.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        })
      }

      // Verificar que no sea un rol por defecto
      if (role.isDefault) {
        return response.status(400).json({
          success: false,
          message: 'No se puede eliminar un rol por defecto'
        })
      }

      // Verificar que no tenga usuarios asignados
      await role.load('users')
      if (role.users.length > 0) {
        return response.status(400).json({
          success: false,
          message: 'No se puede eliminar un rol que tiene usuarios asignados'
        })
      }

      await role.delete()

      return response.json({
        success: true,
        message: 'Rol eliminado exitosamente'
      })
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Error al eliminar el rol'
      })
    }
  }

  /**
   * Obtener todas las funcionalidades disponibles
   */
  async functionalities({ response }: HttpContext) {
    try {
      const functionalities = await Functionality.getAllGroupedByModule()

      return response.json({
        success: true,
        data: functionalities
      })
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Error al obtener funcionalidades'
      })
    }
  }

  /**
   * Asignar permisos a un rol
   */
  async assignPermissions({ auth, request, response, params }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()
      const permissions = request.input('permissions', [])

      const role = await Role.query()
        .where('id', params.id)
        .where('company_id', user.companyId)
        .first()

      if (!role) {
        return response.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        })
      }

      // Eliminar permisos existentes
      await Permission.query()
        .where('role_id', role.id)
        .delete()

      // Crear nuevos permisos
      const newPermissions = []
      for (const permissionData of permissions) {
        const validatedData = await this.permissionValidator.validate(permissionData)

        // Verificar que la funcionalidad existe
        const functionality = await Functionality.find(validatedData.functionality_id)
        if (functionality) {
          newPermissions.push({
            roleId: role.id,
            functionalityId: validatedData.functionality_id,
            canAccess: validatedData.can_access ?? true,
            canCreate: validatedData.can_create ?? false,
            canRead: validatedData.can_read ?? true,
            canUpdate: validatedData.can_update ?? false,
            canDelete: validatedData.can_delete ?? false,
            restrictions: validatedData.restrictions
          })
        }
      }

      if (newPermissions.length > 0) {
        await Permission.createMany(newPermissions)
      }

      // Cargar el rol con los nuevos permisos
      await role.load('permissions', (permissionQuery) => {
        permissionQuery.preload('functionality')
      })

      return response.json({
        success: true,
        message: 'Permisos asignados exitosamente',
        data: role
      })
    } catch (error) {
      return response.status(422).json({
        success: false,
        message: 'Error de validación',
        errors: error.messages || error.message
      })
    }
  }

  /**
   * Clonar un rol existente
   */
  async clone({ auth, request, response, params }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()
      const { name, code } = request.only(['name', 'code'])

      if (!name || !code) {
        return response.status(422).json({
          success: false,
          message: 'Nombre y código son requeridos'
        })
      }

      const originalRole = await Role.query()
        .where('id', params.id)
        .where('company_id', user.companyId)
        .preload('permissions')
        .first()

      if (!originalRole) {
        return response.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        })
      }

      // Verificar que el código no exista
      const existingRole = await Role.query()
        .where('company_id', user.companyId)
        .where('code', code)
        .first()

      if (existingRole) {
        return response.status(409).json({
          success: false,
          message: 'Ya existe un rol con este código'
        })
      }

      // Crear el nuevo rol
      const newRole = await Role.create({
        companyId: user.companyId,
        name,
        code,
        description: `Copia de ${originalRole.name}`,
        isActive: true,
        isDefault: false
      })

      // Copiar permisos
      const permissionsToClone = originalRole.permissions.map(permission => ({
        roleId: newRole.id,
        functionalityId: permission.functionalityId,
        canAccess: permission.canAccess,
        canCreate: permission.canCreate,
        canRead: permission.canRead,
        canUpdate: permission.canUpdate,
        canDelete: permission.canDelete,
        restrictions: permission.restrictions
      }))

      if (permissionsToClone.length > 0) {
        await Permission.createMany(permissionsToClone)
      }

      // Cargar el rol con sus permisos
      await newRole.load('permissions', (permissionQuery) => {
        permissionQuery.preload('functionality')
      })

      return response.status(201).json({
        success: true,
        message: 'Rol clonado exitosamente',
        data: newRole
      })
    } catch (error) {
      return response.status(422).json({
        success: false,
        message: 'Error al clonar rol',
        errors: error.message
      })
    }
  }

  /**
   * Activar/Desactivar rol
   */
  async toggleStatus({ auth, response, params }: HttpContext) {
    try {
      const user = await auth.getUserOrFail()

      const role = await Role.query()
        .where('id', params.id)
        .where('company_id', user.companyId)
        .first()

      if (!role) {
        return response.status(404).json({
          success: false,
          message: 'Rol no encontrado'
        })
      }

      // No se puede desactivar un rol por defecto
      if (role.isDefault && role.isActive) {
        return response.status(400).json({
          success: false,
          message: 'No se puede desactivar un rol por defecto'
        })
      }

      role.isActive = !role.isActive
      await role.save()

      return response.json({
        success: true,
        message: `Rol ${role.isActive ? 'activado' : 'desactivado'} exitosamente`,
        data: role
      })
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Error al cambiar estado del rol'
      })
    }
  }
}