import Location from '#models/location'
import vine from '@vinejs/vine'
import { Decimal } from 'decimal.js'

// La regla personalizada está bien. Solo añadimos una comprobación más explícita.
const locationBelongsToCompany = vine.createRule(async (value: unknown, options: { companyId: number }, field) => {
    // Esta es la causa del error: options.companyId está llegando como 'undefined'.
    // Esta comprobación lo hace evidente.
    if (!options.companyId) {
        field.report('Server Error: companyId was not provided to the validator.', 'locationBelongsToCompany', field)
        return
    }

    if (typeof value !== 'number') {
        return // Vine ya maneja el error de tipo de dato.
    }

    const location = await Location.query()
        .where('id', value)
        .where('company_id', options.companyId) // Aquí es donde ocurría el error.
        .first()

    if (!location) {
        field.report('The selected location does not exist or does not belong to your company.', 'locationBelongsToCompany', field)
    }
})

/**
 * Validador para crear una caja registradora.
 */
export const createCashRegisterValidatorWithCompany = (companyId: number) => {
    return vine.compile(
        vine.object({
            locationId: vine.number().positive().use(locationBelongsToCompany({ companyId })),
            name: vine.string().trim().minLength(1).maxLength(255),

            // CORRECCIÓN 1: Se valida como string (más flexible para APIs) y se transforma a número.
            initialBalance: vine.string()
                .regex(/^\d+(\.\d{1,2})?$/)
                .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
                .optional(), // El valor por defecto se maneja en el controlador.

            isActive: vine.boolean().optional(),
        })
    )
}

/**
 * Validador para actualizar una caja registradora.
 */
export const updateCashRegisterValidatorWithCompany = (companyId: number) => {
    return vine.compile(
        vine.object({
            // CORRECCIÓN 2: Todos los campos son opcionales en una actualización.
            locationId: vine.number().positive().use(locationBelongsToCompany({ companyId })).optional(),
            name: vine.string().trim().minLength(1).maxLength(255).optional(),
            initialBalance: vine.string()
                .regex(/^\d+(\.\d{1,2})?$/)
                .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
                .optional(),
            isActive: vine.boolean().optional(),
        })
    )
}