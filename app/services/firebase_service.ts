import admin from 'firebase-admin'
import app from '@adonisjs/core/services/app'
import DeviceToken from '#models/device_token'

class FirebaseService {
  private initialized = false

  constructor() {
    this.initialize()
  }

  initialize() {
    if (this.initialized) return

    const serviceAccountPath = app.makePath('firebase-credentials.json')

    try {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountPath),
      })
      this.initialized = true
      console.log('✅ Firebase Admin SDK inicializado correctamente.')
    } catch (error) {
      console.error('❌ Error al inicializar Firebase Admin SDK:', error)
    }
  }

  async sendPushNotification(locationId: number, title: string, body: string, data?: { [key: string]: string }, rolesToSend?: string[]) {
    if (!this.initialized) {
      console.error('Firebase no está inicializado. No se puede enviar la notificación.')
      return
    }

    // 1. Inicia la consulta base para los tokens de la sucursal
    const query = DeviceToken.query().where('location_id', locationId);

    // 2. Si se proporciona un array de roles, añade el filtro a la consulta
    if (rolesToSend && rolesToSend.length > 0) {
      query.whereHas('user', (userQuery) => {
        // Filtra los usuarios que tienen una relación con 'role'...
        userQuery.whereHas('role', (roleQuery) => {
          // ...cuyo 'code' esté en la lista de roles permitidos.
          roleQuery.whereIn('code', rolesToSend)
        })
      })
    }

    // 3. Ejecuta la consulta (ya sea la base o la filtrada)
    const deviceTokens = await query

    // 1. Obtiene los tokens de la sucursal específica
    const tokens = deviceTokens.map(dt => dt.token)

    if (tokens.length === 0) {
      console.log(`No hay dispositivos registrados para la sucursal ${locationId}.`)
      return
    }

    // 2. Construye el mensaje
    const message = {
      notification: { title, body },
      tokens: tokens,
      data: data || {},
      webpush: {
        notification: {
          icon: 'URL_A_TU_LOGO_PUBLICO' // Opcional pero recomendado
        }
      }
    }

    // 3. Envía el mensaje
    try {
      const response = await admin.messaging().sendEachForMulticast(message)
      console.log('Notificaciones enviadas con éxito:', response.successCount)
      console.log('Notificaciones fallidas:', response.failureCount)

      // --- 👇 INICIA LA LÓGICA DE LIMPIEZA DE TOKENS INVÁLIDOS ---
      if (response.failureCount > 0) {
        const tokensToDelete: string[] = []

        // 1. Itera sobre cada respuesta individual
        response.responses.forEach((result, index) => {
          const error = result.error

          // 2. Comprueba si el envío a este token específico falló
          if (error) {
            console.error(`Fallo para el token [${tokens[index]}]:`, error.code)

            // 3. Verifica si el código de error indica que el token es inválido o no está registrado
            if (
              error.code === 'messaging/registration-token-not-registered' ||
              error.code === 'messaging/invalid-registration-token'
            ) {
              // 4. Si lo es, añade el token a la lista de eliminación
              tokensToDelete.push(tokens[index])
            }
          }
        })

        // 5. Si hay tokens en la lista de eliminación, bórralos de la base de datos
        if (tokensToDelete.length > 0) {
          console.log(`Eliminando ${tokensToDelete.length} tokens obsoletos...`)
          await DeviceToken.query().whereIn('token', tokensToDelete).delete()
          console.log('Tokens obsoletos eliminados.')
        }
      }

      // --- 👆 TERMINA LA LÓGICA DE LIMPIEZA ---

    } catch (error) {
      console.error('Error al enviar notificaciones:', error)
    }
  }

}

export default new FirebaseService()