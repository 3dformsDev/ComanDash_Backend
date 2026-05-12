// app/validators/payment_method_validator.ts
import vine from '@vinejs/vine'

/**
 * Tipos válidos para métodos de pago
 */
const paymentMethodTypes = ['cash', 'card', 'digital', 'transfer', 'other'] as const

/**
 * Validator para crear un nuevo método de pago
 */
export const createPaymentMethodValidator = vine.compile(
    vine.object({
        // El companyId no se valida aquí porque lo tomaremos de la URL para mayor seguridad.

        name: vine
            .string()
            .trim()
            .minLength(2)
            .maxLength(100),

        type: vine
            .enum(paymentMethodTypes),

        requiresReference: vine
            .boolean()
            .optional(),

        isActive: vine
            .boolean()
            .optional()
    })
)

/**
 * Validator para actualizar un método de pago existente
 */
export const updatePaymentMethodValidator = vine.compile(
    vine.object({
        name: vine
            .string()
            .trim()
            .minLength(2)
            .maxLength(100)
            .optional(),

        type: vine
            .enum(paymentMethodTypes)
            .optional(),

        requiresReference: vine
            .boolean()
            .optional(),

        isActive: vine
            .boolean()
            .optional()
    })
)

/**
 * Validator para parámetros de búsqueda/filtrado
 */
export const paymentMethodParamsValidator = vine.compile(
    vine.object({
        id: vine
            .number()
            .positive()
            .withoutDecimals()
    })
)

/**
 * Validator para query parameters de listado
 */
export const paymentMethodQueryValidator = vine.compile(
    vine.object({
        type: vine
            .enum(paymentMethodTypes)
            .optional(),

        isActive: vine
            .boolean()
            .optional(),

        // El companyId no se valida aquí porque lo tomaremos de la URL para mayor seguridad.

        page: vine
            .number()
            .positive()
            .withoutDecimals()
            .optional(),

        limit: vine
            .number()
            .positive()
            .withoutDecimals()
            .range([1, 100])
            .optional(),

        search: vine
            .string()
            .trim()
            .minLength(1)
            .maxLength(50)
            .optional()
    })
)