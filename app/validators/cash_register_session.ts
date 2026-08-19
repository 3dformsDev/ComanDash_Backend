import CashRegister from '#models/cash_register'
import CashRegisterSession from '#models/cash_registers_session'
import vine from '@vinejs/vine'
import { Decimal } from 'decimal.js'

// Regla para validar que la caja registradora existe, pertenece a la compañía y está activa
const cashRegisterBelongsToCompany = vine.createRule(async (value: unknown, options: { companyId: number }, field) => {
    if (!options.companyId) {
        field.report('Server Error: companyId was not provided to the validator.', 'cashRegisterBelongsToCompany', field)
        return
    }

    if (typeof value !== 'number') {
        return // Vine ya maneja el error de tipo de dato.
    }

    const cashRegister = await CashRegister.query()
        .where('id', value)
        .where('company_id', options.companyId)
        .first()

    if (!cashRegister) {
        field.report('The selected cash register does not exist or does not belong to your company.', 'cashRegisterBelongsToCompany', field)
        return
    }

    if (!cashRegister.isActive) {
        field.report('The selected cash register is not active.', 'cashRegisterInactive', field)
        return
    }
})

// Regla para validar que el usuario existe y pertenece a la compañía
// const userBelongsToCompany = vine.createRule(async (value: unknown, options: { companyId: number }, field) => {
//     if (!options.companyId) {
//         field.report('Server Error: companyId was not provided to the validator.', 'userBelongsToCompany', field)
//         return
//     }

//     if (typeof value !== 'number') {
//         return // Vine ya maneja el error de tipo de dato.
//     }

//     const user = await User.query()
//         .where('id', value)
//         .where('company_id', options.companyId)
//         .first()

//     if (!user) {
//         field.report('The selected user does not exist or does not belong to your company.', 'userBelongsToCompany', field)
//         return
//     }

//     // Opcional: Validar que el usuario esté activo si tienes ese campo
//     // if (!user.isActive) {
//     //     field.report('The selected user is not active.', 'userInactive', field)
//     //     return
//     // }
// })

// Regla para validar que no existe una sesión abierta para la caja registradora
const cashRegisterNotHasOpenSession = vine.createRule(async (value: unknown, options: { companyId: number }, field) => {
    if (!options.companyId) {
        field.report('Server Error: companyId was not provided to the validator.', 'cashRegisterNotHasOpenSession', field)
        return
    }

    if (typeof value !== 'number') {
        return // Vine ya maneja el error de tipo de dato.
    }

    const openSession = await CashRegisterSession.query()
        .where('cash_register_id', value)
        .where('company_id', options.companyId)
        .where('status', 'open')
        .first()

    if (openSession) {
        field.report('There is already an open session for this cash register. Please close it before creating a new one.', 'cashRegisterHasOpenSession', field)
        return
    }
})

// Regla para validar que el balance de cierre sea mayor o igual al de apertura (solo para actualizaciones)
const closingBalanceValidation = vine.createRule(async (value: unknown, options: { openingBalance?: number }, field) => {
    if (typeof value !== 'number' || typeof options.openingBalance !== 'number') {
        return
    }

    if (value < 0) {
        field.report('The closing balance cannot be negative.', 'closingBalanceNegative', field)
        return
    }
})

/**
 * Validador para crear una sesión de caja registradora.
 */
export const createCashRegisterSessionValidatorWithCompany = (companyId: number) => {
    return vine.compile(
        vine.object({
            cashRegisterId: vine.number().positive().use(cashRegisterBelongsToCompany({ companyId })).use(cashRegisterNotHasOpenSession({ companyId })),
            // userId: vine.number().positive().use(userBelongsToCompany({ companyId })),
            // name: vine.string().trim().minLength(1).maxLength(255),

            // Balance inicial - se valida como string y se transforma a número decimal
            openingBalance: vine.string()
                .regex(/^\d+(\.\d{1,2})?$/)
                .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber()),

            // Notas opcionales
            notes: vine.string().trim().maxLength(1000).optional(),

            // Status por defecto será 'open' según el esquema
            status: vine.enum(['open', 'closed']).optional(),
        })
    )
}

/**
 * Validador para actualizar una sesión de caja registradora.
 */
export const updateCashRegisterSessionValidatorWithCompany = () => {
    return vine.compile(
        vine.object({
            // En actualizaciones, generalmente no se permite cambiar la caja registradora ni el usuario
            // name: vine.string().trim().minLength(1).maxLength(255).optional(),

            // Balance de cierre - solo se puede establecer cuando se cierra la sesión
            closingBalance: vine.string()
                .regex(/^\d+(\.\d{1,2})?$/)
                .use(closingBalanceValidation({}))
                .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
                .optional(),

            // Balance real de cierre (conteo físico)
            realClosingBalance: vine.string()
                .regex(/^\d+(\.\d{1,2})?$/)
                .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
                .optional(),

            // La diferencia se calcula automáticamente, pero se puede enviar para validación
            differenceAmount: vine.string()
                .regex(/^-?\d+(\.\d{1,2})?$/) // Permite números negativos
                .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
                .optional(),

            // Notas - pueden ser útiles al cerrar la sesión
            notes: vine.string().trim().maxLength(1000).optional(),
        })
    )
}

/**
 * Validador específico para cerrar una sesión de caja registradora.
 * Este validador es más estricto y requiere campos específicos para el cierre.
 */
export const closeCashRegisterSessionValidatorWithCompany = () => {
    return vine.compile(
        vine.object({
            // Balance real de cierre es obligatorio al cerrar
            realClosingBalance: vine.string()
                .regex(/^\d+(\.\d{1,2})?$/)
                .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber()),
            // Notas sobre el cierre - altamente recomendadas
            notes: vine.string().trim().maxLength(1000).optional(),

        })
    )
}
