import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Role from '#models/role'
import Permission from '#models/permission'
import Functionality from '#models/functionality'
import Company from '#models/company'

export default class DefaultRolesSeeder extends BaseSeeder {
  async run() {
    // Este seeder se debe ejecutar después de crear las empresas y funcionalidades
    
    // Obtener todas las empresas para crear roles por defecto
    const companies = await Company.all()
    
    // Obtener todas las funcionalidades
    const functionalities = await Functionality.all()
    const functionalityMap = functionalities.reduce((map, func) => {
      map[func.code] = func.id
      return map
    }, {} as Record<string, number>)

    for (const company of companies) {
      // Crear roles básicos para cada empresa
      const roles = await Role.createMany([
        {
          companyId: company.id,
          name: 'Super Administrador',
          description: 'Acceso completo a todas las funcionalidades',
          code: 'super_admin',
          isActive: true,
          isDefault: false
        },
        {
          companyId: company.id,
          name: 'Administrador',
          description: 'Administrador con permisos de gestión',
          code: 'admin',
          isActive: true,
          isDefault: false
        },
        {
          companyId: company.id,
          name: 'Gerente',
          description: 'Gerente con permisos de supervisión',
          code: 'manager',
          isActive: true,
          isDefault: false
        },
        {
          companyId: company.id,
          name: 'Cajero',
          description: 'Personal de caja con permisos de venta',
          code: 'cashier',
          isActive: true,
          isDefault: true
        },
        {
          companyId: company.id,
          name: 'Mesero',
          description: 'Personal de servicio',
          code: 'waiter',
          isActive: true,
          isDefault: false
        },
        {
          companyId: company.id,
          name: 'Cocina',
          description: 'Personal de cocina',
          code: 'kitchen',
          isActive: true,
          isDefault: false
        }
      ])

      // Asignar permisos a cada rol
      for (const role of roles) {
        let permissions: any[] = []

        switch (role.code) {
          case 'super_admin':
            // Super admin tiene todos los permisos
            permissions = functionalities.map(func => ({
              roleId: role.id,
              functionalityId: func.id,
              canAccess: true,
              canCreate: true,
              canRead: true,
              canUpdate: true,
              canDelete: true
            }))
            break

          case 'admin':
            // Admin tiene la mayoría de permisos excepto algunas configuraciones críticas
            permissions = [
              // Gestión de usuarios
              { roleId: role.id, functionalityId: functionalityMap['users.manage'], canAccess: true, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
              { roleId: role.id, functionalityId: functionalityMap['users.create'], canAccess: true, canCreate: true, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['users.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['users.update'], canAccess: true, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['users.delete'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: true },
              
              // Gestión de roles (limitada)
              { roleId: role.id, functionalityId: functionalityMap['roles.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              
              // Ubicaciones
              { roleId: role.id, functionalityId: functionalityMap['locations.manage'], canAccess: true, canCreate: true, canRead: true, canUpdate: true, canDelete: true },
              
              // Ventas completas
              { roleId: role.id, functionalityId: functionalityMap['sales.manage'], canAccess: true, canCreate: true, canRead: true, canUpdate: true, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.create'], canAccess: true, canCreate: true, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.cancel'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: true },
              
              // Inventario
              { roleId: role.id, functionalityId: functionalityMap['inventory.manage'], canAccess: true, canCreate: true, canRead: true, canUpdate: true, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['inventory.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['inventory.update'], canAccess: true, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
              
              // Reportes
              { roleId: role.id, functionalityId: functionalityMap['reports.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['reports.export'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false }
            ]
            break

          case 'manager':
            permissions = [
              // Usuarios limitado
              { roleId: role.id, functionalityId: functionalityMap['users.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['users.update'], canAccess: true, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
              
              // Ventas
              { roleId: role.id, functionalityId: functionalityMap['sales.manage'], canAccess: true, canCreate: true, canRead: true, canUpdate: true, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.create'], canAccess: true, canCreate: true, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.cancel'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: true },
              
              // Inventario
              { roleId: role.id, functionalityId: functionalityMap['inventory.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['inventory.update'], canAccess: true, canCreate: false, canRead: true, canUpdate: true, canDelete: false },
              
              // Reportes
              { roleId: role.id, functionalityId: functionalityMap['reports.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['reports.export'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false }
            ]
            break

          case 'cashier':
            permissions = [
              // Solo ventas
              { roleId: role.id, functionalityId: functionalityMap['sales.create'], canAccess: true, canCreate: true, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              
              // Inventario solo lectura
              { roleId: role.id, functionalityId: functionalityMap['inventory.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false }
            ]
            break

          case 'waiter':
            permissions = [
              // Ventas básicas
              { roleId: role.id, functionalityId: functionalityMap['sales.create'], canAccess: true, canCreate: true, canRead: true, canUpdate: false, canDelete: false },
              { roleId: role.id, functionalityId: functionalityMap['sales.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              
              // Inventario consulta
              { roleId: role.id, functionalityId: functionalityMap['inventory.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false }
            ]
            break

          case 'kitchen':
            permissions = [
              // Solo consulta de ventas para preparar pedidos
              { roleId: role.id, functionalityId: functionalityMap['sales.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false },
              
              // Inventario para ver disponibilidad
              { roleId: role.id, functionalityId: functionalityMap['inventory.read'], canAccess: true, canCreate: false, canRead: true, canUpdate: false, canDelete: false }
            ]
            break
        }

        // Filtrar permisos válidos (donde la funcionalidad existe)
        const validPermissions = permissions.filter(perm => perm.functionalityId)
        
        if (validPermissions.length > 0) {
          await Permission.createMany(validPermissions)
        }
      }
    }
  }
}