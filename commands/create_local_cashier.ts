import { BaseCommand, flags } from '@adonisjs/core/ace'
import env from '#start/env'
import User from '#models/user'
import Role from '#models/role'
import Location from '#models/location'

/** Eduard runs this interactively; it is never part of migrations or production setup. */
export default class CreateLocalCashier extends BaseCommand {
  static commandName = 'test:create-cashier'
  static description = 'Crear una cuenta de cajero para pruebas locales, sin mostrar su contraseña'
  static options = { startApp: true }

  @flags.number({ description: 'Empresa local de prueba', required: true })
  declare companyId: number
  @flags.number({ description: 'Sede local de prueba', required: true })
  declare locationId: number

  async run() {
    if (env.get('NODE_ENV') !== 'development' || !['localhost', '127.0.0.1', '::1'].includes(env.get('DB_HOST'))) {
      this.logger.error('Solo se permite en desarrollo y con una base de datos local.'); this.exitCode = 1; return
    }
    const location = await Location.query().where('company_id', this.companyId).where('id', this.locationId).first()
    const role = await Role.query().where('company_id', this.companyId).where('code', 'cashier').where('is_active', true).first()
    if (!location || !role) {
      this.logger.error('No se encontró la sede o un rol cajero activo de esta empresa. No se modificó nada.'); this.exitCode = 1; return
    }
    const username = (await this.prompt.ask('Nombre de usuario nuevo (ej. cajero_pruebas)')).trim()
    if (!/^[a-zA-Z0-9_]{3,40}$/.test(username) || await User.findBy('username', username)) {
      this.logger.error('Nombre inválido o ya utilizado. No se modificó ninguna cuenta.'); this.exitCode = 1; return
    }
    const password = await this.prompt.secure('Contraseña para esta cuenta local (mínimo 8 caracteres)')
    if (password.length < 8 || password !== await this.prompt.secure('Repite la contraseña')) {
      this.logger.error('Las contraseñas no coinciden o son demasiado cortas.'); this.exitCode = 1; return
    }
    if (!await this.prompt.confirm(`Crear ${username}, empresa ${this.companyId}, sede ${this.locationId}, en ${env.get('DB_DATABASE')} (local)?`)) return
    try {
      const user = await User.create({ username, password, fullName: 'Cajero de pruebas',
        companyId: this.companyId, locationId: this.locationId, roleId: role.id, isActive: true })
      this.logger.success(`Cuenta local creada: ${username} (ID ${user.id}). No se cambiaron otras cuentas.`)
    } catch {
      this.logger.error('No se pudo crear la cuenta local. Verifica si el nombre ya está utilizado.'); this.exitCode = 1
    }
  }
}
