import DeviceToken from '#models/device_token'
import { storeDeviceTokenValidator } from '#validators/store_device_token'
import type { HttpContext } from '@adonisjs/core/http'

export default class NotificationsController {
    /**
 * Almacena o actualiza el token de un dispositivo para un usuario autenticado.
 * Este método asegura que un token de dispositivo sea único en toda la aplicación,
 * reasignándolo al nuevo usuario si ya existía.
 */
    public async storeDeviceToken({ request, auth, response }: HttpContext) {
        const payload = await request.validateUsing(storeDeviceTokenValidator)
        const { token, locationId } = payload
        const user = auth.user!

        try {
            // La magia de 'updateOrCreate' con la lógica correcta:
            // 1. El primer objeto define el criterio de BÚSQUEDA.
            //    Buscamos un registro que tenga este 'token', sin importar de qué usuario sea.
            // 2. El segundo objeto define los DATOS a escribir.
            //    Si se encontró un token, se actualiza su 'userId' y 'locationId'.
            //    Si no se encontró, se crea un nuevo registro con el 'token', 'userId' y 'locationId'.
            await DeviceToken.updateOrCreate(
                {
                    token: token, // <-- Clave de búsqueda: solo el token
                },
                {
                    userId: user.id, // Dato para actualizar/crear
                    locationId: locationId, // Dato para actualizar/crear
                }
            )

            console.log(`Token [${token.substring(0, 15)}...] asignado al usuario #${user.id}`)

            return response.ok({
                success: true,
                message: 'Token del dispositivo almacenado correctamente.',
            })
        } catch (error) {
            console.error('Error al almacenar el token del dispositivo:', error)
            return response.internalServerError({
                success: false,
                message: 'No se pudo almacenar el token del dispositivo.',
            })
        }
    }
}