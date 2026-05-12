import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Functionality from '#models/functionality'

export default class FunctionalitiesSeeder extends BaseSeeder {
  async run() {
    // Definir funcionalidades del sistema
    const functionalities = [
      // Módulo de Usuarios
      {
        name: 'Gestión de Usuarios',
        description: 'Administrar usuarios del sistema',
        code: 'users.manage',
        module: 'users',
        action: 'manage'
      },
      {
        name: 'Crear Usuario',
        description: 'Crear nuevos usuarios',
        code: 'users.create',
        module: 'users',
        action: 'create'
      },
      {
        name: 'Ver Usuarios',
        description: 'Ver lista de usuarios',
        code: 'users.read',
        module: 'users',
        action: 'read'
      },
      {
        name: 'Editar Usuario',
        description: 'Modificar información de usuarios',
        code: 'users.update',
        module: 'users',
        action: 'update'
      },
      {
        name: 'Eliminar Usuario',
        description: 'Eliminar usuarios del sistema',
        code: 'users.delete',
        module: 'users',
        action: 'delete'
      },

      // Módulo de Roles
      {
        name: 'Gestión de Roles',
        description: 'Administrar roles del sistema',
        code: 'roles.manage',
        module: 'roles',
        action: 'manage'
      },
      {
        name: 'Crear Rol',
        description: 'Crear nuevos roles',
        code: 'roles.create',
        module: 'roles',
        action: 'create'
      },
      {
        name: 'Ver Roles',
        description: 'Ver lista de roles',
        code: 'roles.read',
        module: 'roles',
        action: 'read'
      },
      {
        name: 'Editar Rol',
        description: 'Modificar roles existentes',
        code: 'roles.update',
        module: 'roles',
        action: 'update'
      },
      {
        name: 'Eliminar Rol',
        description: 'Eliminar roles del sistema',
        code: 'roles.delete',
        module: 'roles',
        action: 'delete'
      },

      // Módulo de Permisos
      {
        name: 'Gestión de Permisos',
        description: 'Administrar permisos del sistema',
        code: 'permissions.manage',
        module: 'permissions',
        action: 'manage'
      },
      {
        name: 'Asignar Permisos',
        description: 'Asignar permisos a roles',
        code: 'permissions.assign',
        module: 'permissions',
        action: 'assign'
      },

      // Módulo de Empresas
      {
        name: 'Gestión de Empresas',
        description: 'Administrar empresas',
        code: 'companies.manage',
        module: 'companies',
        action: 'manage'
      },
      {
        name: 'Ver Empresas',
        description: 'Ver información de empresas',
        code: 'companies.read',
        module: 'companies',
        action: 'read'
      },
      {
        name: 'Editar Empresa',
        description: 'Modificar información de la empresa',
        code: 'companies.update',
        module: 'companies',
        action: 'update'
      },

      // Módulo de Ubicaciones
      {
        name: 'Gestión de Ubicaciones',
        description: 'Administrar ubicaciones',
        code: 'locations.manage',
        module: 'locations',
        action: 'manage'
      },
      {
        name: 'Crear Ubicación',
        description: 'Crear nuevas ubicaciones',
        code: 'locations.create',
        module: 'locations',
        action: 'create'
      },
      {
        name: 'Ver Ubicaciones',
        description: 'Ver lista de ubicaciones',
        code: 'locations.read',
        module: 'locations',
        action: 'read'
      },
      {
        name: 'Editar Ubicación',
        description: 'Modificar ubicaciones existentes',
        code: 'locations.update',
        module: 'locations',
        action: 'update'
      },
      {
        name: 'Eliminar Ubicación',
        description: 'Eliminar ubicaciones',
        code: 'locations.delete',
        module: 'locations',
        action: 'delete'
      },

      // Módulo de Ventas (ejemplo para restaurante)
      {
        name: 'Gestión de Ventas',
        description: 'Administrar ventas',
        code: 'sales.manage',
        module: 'sales',
        action: 'manage'
      },
      {
        name: 'Crear Venta',
        description: 'Registrar nuevas ventas',
        code: 'sales.create',
        module: 'sales',
        action: 'create'
      },
      {
        name: 'Ver Ventas',
        description: 'Ver historial de ventas',
        code: 'sales.read',
        module: 'sales',
        action: 'read'
      },
      {
        name: 'Anular Venta',
        description: 'Anular ventas existentes',
        code: 'sales.cancel',
        module: 'sales',
        action: 'cancel'
      },

      // Módulo de Inventario
      {
        name: 'Gestión de Inventario',
        description: 'Administrar inventario',
        code: 'inventory.manage',
        module: 'inventory',
        action: 'manage'
      },
      {
        name: 'Ver Inventario',
        description: 'Consultar inventario',
        code: 'inventory.read',
        module: 'inventory',
        action: 'read'
      },
      {
        name: 'Actualizar Inventario',
        description: 'Modificar cantidades de inventario',
        code: 'inventory.update',
        module: 'inventory',
        action: 'update'
      },

      // Módulo de Reportes
      {
        name: 'Ver Reportes',
        description: 'Acceder a reportes del sistema',
        code: 'reports.read',
        module: 'reports',
        action: 'read'
      },
      {
        name: 'Exportar Reportes',
        description: 'Exportar reportes',
        code: 'reports.export',
        module: 'reports',
        action: 'export'
      },

      // Módulo de Configuración
      {
        name: 'Configuración General',
        description: 'Acceder a configuraciones del sistema',
        code: 'settings.manage',
        module: 'settings',
        action: 'manage'
      }
    ]

    // Insertar funcionalidades
    await Functionality.createMany(functionalities)
  }
}