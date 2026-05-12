import vine from '@vinejs/vine'
import { Decimal } from 'decimal.js'

// Función helper para validar y transformar a número
const decimalTransform = (value: any) => {
    if (!value) return null
    const dec = new Decimal(value)
    // Redondear a 2 decimales para que coincida con la DB
    return parseFloat(dec.toDecimalPlaces(2).toString())
}

export const createProductValidator = vine.compile(
    vine.object({
        categoryId: vine.number().exists(async (db, value) => {
            return await db.from('categories').where('id', value).first()
        }),
        name: vine.string().trim().minLength(2).maxLength(150),
        description: vine.string().optional().nullable(),
        price: vine
            .string()
            .regex(/^\d+(\.\d{1,2})?$/) // máximo 2 decimales
            .transform((value: any) => {
                if (!value) throw new Error('Price is required')
                const dec = new Decimal(value)
                return parseFloat(dec.toDecimalPlaces(2).toString())
            }),
        cost: vine
            .string()
            .regex(/^\d+(\.\d{1,2})?$/)
            .optional()
            .nullable()
            .transform(decimalTransform),
        image: vine.file({
            size: '5mb',
            extnames: ['jpg', 'jpeg', 'png', 'webp']
        }).optional(),
        sku: vine.string().trim().maxLength(50).optional().nullable(),
        isAvailable: vine.boolean().optional(),
        isActive: vine.boolean().optional(),
        preparationTime: vine.number().positive().optional().nullable(),
    })
)

export const updateProductValidator = vine.compile(
    vine.object({
        categoryId: vine.number().exists(async (db, value) => {
            return await db.from('categories').where('id', value).first()
        }).optional(),
        name: vine.string().trim().minLength(2).maxLength(150).optional(),
        description: vine.string().optional().nullable(),
        price: vine
            .string()
            .regex(/^\d+(\.\d{1,2})?$/)
            .optional()
            .transform(decimalTransform),
        cost: vine
            .string()
            .regex(/^\d+(\.\d{1,2})?$/)
            .optional()
            .nullable()
            .transform(decimalTransform),
        image: vine.file({
            size: '5mb',
            extnames: ['jpg', 'jpeg', 'png', 'webp']
        }).optional(),
        sku: vine.string().trim().maxLength(50).optional().nullable(),
        isAvailable: vine.boolean().optional(),
        isActive: vine.boolean().optional(),
        preparationTime: vine.number().positive().optional().nullable(),
    })
)
