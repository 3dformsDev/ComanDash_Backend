// bin/server.ts

import 'reflect-metadata'
import { Ignitor, prettyPrintError } from '@adonisjs/core'

// PRUEBA DE FUEGO: Este log debe aparecer SIEMPRE al iniciar.
console.log('--- [1/5] Ejecutando bin/server.ts ---')

const APP_ROOT = new URL('../', import.meta.url)

const IMPORTER = (filePath: string) => {
  if (filePath.startsWith('./') || filePath.startsWith('../')) {
    return import(new URL(filePath, APP_ROOT).href)
  }
  return import(filePath)
}

new Ignitor(APP_ROOT, { importer: IMPORTER })
  .tap((app) => {
    app.booting(async () => {
      console.log('--- [2/5] App booting... ---')
      await import('#start/env')
    })
    app.listen('SIGTERM', () => app.terminate())
    app.listenIf(app.managedByPm2, 'SIGINT', () => app.terminate())

    // Este es el hook que debe llamar a nuestro código de socket.
    app.ready(async () => {
      console.log('--- [3/5] Hook app.ready() EJECUTADO. ---')
      try {
        const { startSocketServer } = await import('#start/socket')
        console.log('--- [4/5] Importación de #start/socket exitosa. Llamando a la función... ---')
        startSocketServer()
      } catch (error) {
        console.error('--- ERROR al importar o ejecutar startSocketServer ---', error)
      }
    })
  })
  .httpServer()
  .start()
  .then(() => {
    console.log('--- [5/5] Servidor HTTP iniciado correctamente. ---')
  })
  .catch((error) => {
    process.exitCode = 1
    prettyPrintError(error)
  })