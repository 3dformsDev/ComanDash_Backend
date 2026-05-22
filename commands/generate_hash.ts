import { BaseCommand } from '@adonisjs/core/ace'
import hash from '@adonisjs/core/services/hash'

export default class GenerateHash extends BaseCommand {
  static commandName = 'generate:hash'

  static description = 'Generar hash de password'

  async run() {
    const password = this.parsed.argv[0]

    if (!password) {
      this.logger.error('Debes enviar un password')
      return
    }

    const hashed = await hash.make(password)

    this.logger.info('')
    this.logger.info('PASSWORD:')
    this.logger.info(password)

    this.logger.info('')
    this.logger.info('HASH:')
    this.logger.info(hashed)
    this.logger.info('')
  }
}
