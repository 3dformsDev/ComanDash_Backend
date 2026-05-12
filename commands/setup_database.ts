import { BaseCommand } from '@adonisjs/core/ace'
import { inject } from '@adonisjs/core'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

@inject()
export default class SetupDatabase extends BaseCommand {
  static commandName = 'setup:database'
  static description = 'Ejecuta migraciones, seeders y relaciones en orden'

  async run() {
    this.logger.info('🚀 Iniciando configuración de la base de datos...')

    try {
      // Paso 0: Limpiar base de datos
      this.logger.info('🧹 Paso 0: Limpiando base de datos...')
      await this.cleanDatabase()
      this.logger.success('✅ Base de datos limpiada')

      // Paso 1: Ejecutar migraciones
      this.logger.info('📋 Paso 1: Ejecutando migraciones...')
      await this.runMigrations()
      this.logger.success('✅ Migraciones completadas')

      // Paso 2: Ejecutar seeders
      this.logger.info('🌱 Paso 2: Ejecutando seeders...')
      await this.runSeeders()
      this.logger.success('✅ Seeders completados')

      // Paso 3: Ejecutar relaciones (si existe)
      this.logger.info('🔗 Paso 3: Configurando relaciones...')
      await this.setupRelations()
      this.logger.success('✅ Relaciones configuradas')

      this.logger.success('🎉 ¡Configuración de base de datos completada exitosamente!')
    } catch (error) {
      this.logger.error('❌ Error durante la configuración de la base de datos:')
      this.logger.error(error.message)
      process.exit(1)
    }
  }

  private async runMigrations() {
    try {
      const { stdout, stderr } = await execAsync('node ace migration:run')
      if (stderr) {
        this.logger.warning('⚠️ Advertencias en migraciones:')
        this.logger.warning(stderr)
      }
      this.logger.info(stdout)
    } catch (error) {
      throw new Error(`Error ejecutando migraciones: ${error.message}`)
    }
  }

  private async cleanDatabase() {
    try {
      const { stdout, stderr } = await execAsync('node ace migration:fresh')
      if (stderr) {
        this.logger.warning('⚠️ Advertencias al limpiar base de datos:')
        this.logger.warning(stderr)
      }
      this.logger.info(stdout)
    } catch (error) {
      throw new Error(`Error limpiando base de datos: ${error.message}`)
    }
  }

  private async runSeeders() {
    try {
      const { stdout, stderr } = await execAsync('node ace db:seed')
      if (stderr) {
        this.logger.warning('⚠️ Advertencias en seeders:')
        this.logger.warning(stderr)
      }
      this.logger.info(stdout)
    } catch (error) {
      throw new Error(`Error ejecutando seeders: ${error.message}`)
    }
  }

  private async setupRelations() {
    try {
      // Aquí puedes agregar lógica para configurar relaciones
      // Por ejemplo, crear relaciones entre datos existentes
      
      // Ejemplo: Crear ubicaciones para las empresas existentes
      await this.createDefaultLocations()
      
      // Ejemplo: Asignar roles por defecto a usuarios
      await this.assignDefaultRoles()
      
      this.logger.info('Relaciones configuradas correctamente')
    } catch (error) {
      this.logger.warning(`⚠️ Advertencia al configurar relaciones: ${error.message}`)
      // No lanzamos error aquí porque las relaciones no son críticas
    }
  }

  private async createDefaultLocations() {
    try {
      // Importar modelos necesarios
      const Company = (await import('#models/company')).default
      const Location = (await import('#models/location')).default

      // Obtener todas las empresas
      const companies = await Company.all()

      for (const company of companies) {
        // Verificar si ya tiene ubicaciones
        const existingLocations = await Location.query()
          .where('company_id', company.id)
          .count('* as count')

        if (existingLocations[0].$extras.count === 0) {
          // Crear ubicación principal por defecto
          await Location.create({
            companyId: company.id,
            name: 'Sede Principal',
            address: company.address || 'Dirección principal',
            phone: company.phone,
            isMain: true,
            isActive: true
          })

          this.logger.info(`📍 Ubicación principal creada para: ${company.name}`)
        }
      }
    } catch (error) {
      this.logger.warning(`⚠️ Error creando ubicaciones por defecto: ${error.message}`)
    }
  }

  private async assignDefaultRoles() {
    try {
      // Importar modelos necesarios
      const User = (await import('#models/user')).default
      const Role = (await import('#models/role')).default

      // Obtener usuarios sin rol asignado
      const usersWithoutRole = await User.query()
        .whereNull('role_id')
        .preload('company')

      for (const user of usersWithoutRole) {
        // Buscar rol por defecto de la empresa
        const defaultRole = await Role.query()
          .where('company_id', user.companyId)
          .where('is_default', true)
          .where('is_active', true)
          .first()

        if (defaultRole) {
          user.roleId = defaultRole.id
          await user.save()
          this.logger.info(`👤 Rol por defecto asignado a: ${user.username}`)
        }
      }
    } catch (error) {
      this.logger.warning(`⚠️ Error asignando roles por defecto: ${error.message}`)
    }
  }
}
