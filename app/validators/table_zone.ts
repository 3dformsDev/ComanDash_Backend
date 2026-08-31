import vine from '@vinejs/vine'

export const tableZoneIconTypes = ['table', 'bar', 'terrace', 'special'] as const

export const createTableZoneValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(100),
    iconType: vine.enum(tableZoneIconTypes),
    displayOrder: vine.number().min(0).optional(),
    isActive: vine.boolean().optional(),
  }),
)

export const updateTableZoneValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(1).maxLength(100).optional(),
    iconType: vine.enum(tableZoneIconTypes).optional(),
    displayOrder: vine.number().min(0).optional(),
    isActive: vine.boolean().optional(),
  }),
)
