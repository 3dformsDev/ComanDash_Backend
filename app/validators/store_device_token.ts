import vine from '@vinejs/vine'

/**
 * Valida la petición para almacenar un token de dispositivo.
 * Se asegura de que los datos necesarios estén presentes y tengan el tipo correcto.
 */
export const storeDeviceTokenValidator = vine.compile(
    vine.object({
        // El 'token' debe ser una cadena de texto. trim() elimina espacios en blanco al inicio y al final.
        token: vine.string().trim(),

        // El 'locationId' debe ser un número y debe ser positivo (mayor que 0).
        locationId: vine.number().positive(),
    })
)

