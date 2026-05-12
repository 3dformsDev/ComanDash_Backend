import vine from '@vinejs/vine'
import { Decimal } from 'decimal.js'

/**
 * Validator para crear movimientos de caja
 */
export const createCashMovementValidator = (companyId: number) => vine.compile(
    vine.object({
        orderId: vine
            .number()
            .positive()
            .exists(async (db, value) => {
                if (!value) return true // Es opcional
                const result = await db.from('orders')
                    .where('id', value)
                    .where('company_id', companyId)
                    .first()
                return !!result
            })
            .optional(),
        movementType: vine
            .enum(['sale', 'withdrawal', 'deposit']),

        notes: vine
            .string()
            .trim()
            .minLength(3)
            .maxLength(500),

        amount: vine.string()
            .regex(/^-?\d+(\.\d{1,2})?$/) // Permite números negativos
            .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
        ,
    })
)

/**
 * Validator para actualizar movimientos de caja
 */
export const updateCashMovementValidator = vine.compile(
    vine.object({
        movementType: vine
            .enum(['sale', 'withdrawal', 'deposit'])
            .optional(),

        notes: vine
            .string()
            .trim()
            .minLength(3)
            .maxLength(500)
            .optional(),

        amount: vine.string()
            .regex(/^-?\d+(\.\d{1,2})?$/) // Permite números negativos
            .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
            .optional(),

        description: vine
            .string()
            .trim()
            .minLength(3)
            .maxLength(255)
            .optional()
    })
)

/**
 * Validator específico para retiros de caja
 */
export const createWithdrawalValidator = vine.compile(
    vine.object({
        amount: vine.string()
            .regex(/^-?\d+(\.\d{1,2})?$/) // Permite números negativos
            .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber()),

        notes: vine
            .string()
            .trim()
            .minLength(5)
            .maxLength(500),

        // Para retiros, podrías requerir autorización
        authorizedBy: vine
            .number()
            .positive()
            .exists(async (db, value) => {
                if (!value) return true
                const result = await db
                    .from('users')
                    .where('id', value)
                    .where('role', 'manager') // Solo managers pueden autorizar
                    .first()
                return !!result
            })
            .optional()
    })
)

/**
 * Validator específico para depósitos
 */
export const createDepositValidator = vine.compile(
    vine.object({
        amount: vine.string()
            .regex(/^-?\d+(\.\d{1,2})?$/) // Permite números negativos
            .transform((value: string) => new Decimal(value).toDecimalPlaces(2).toNumber())
            .optional(),

        notes: vine
            .string()
            .trim()
            .minLength(3)
            .maxLength(500),

        description: vine
            .string()
            .trim()
            .maxLength(255)
            .optional()
    })
)