// start/validators/category.ts
import vine from '@vinejs/vine'

export const createCategoryValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(2).maxLength(100),
        displayOrder: vine.number().optional(),
        isActive: vine.boolean().optional(),
    })
)

export const updateCategoryValidator = vine.compile(
    vine.object({
        name: vine.string().trim().minLength(2).maxLength(100).optional(),
        displayOrder: vine.number().optional(),
        isActive: vine.boolean().optional(),
    })
)
