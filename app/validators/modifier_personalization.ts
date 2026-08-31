import vine from '@vinejs/vine'

export const createModifierGroupValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(150),
    description: vine.string().trim().maxLength(500).optional().nullable(),
    displayOrder: vine.number().min(0).optional(),
    isActive: vine.boolean().optional(),
  }),
)

export const updateModifierGroupValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(2).maxLength(150).optional(),
    description: vine.string().trim().maxLength(500).optional().nullable(),
    displayOrder: vine.number().min(0).optional(),
    isActive: vine.boolean().optional(),
  }),
)

export const createModifierOptionValidator = vine.compile(
  vine.object({
    modifierGroupId: vine.number().positive(),
    name: vine.string().trim().minLength(1).maxLength(150),
    displayOrder: vine.number().min(0).optional(),
    isActive: vine.boolean().optional(),
  }),
)

export const updateModifierOptionValidator = vine.compile(
  vine.object({
    modifierGroupId: vine.number().positive().optional(),
    name: vine.string().trim().minLength(1).maxLength(150).optional(),
    displayOrder: vine.number().min(0).optional(),
    isActive: vine.boolean().optional(),
  }),
)

export const syncProductPersonalizationsValidator = vine.compile(
  vine.object({
    groups: vine.array(
      vine.object({
        modifierGroupId: vine.number().positive(),
        isRequired: vine.boolean(),
        selectionLimit: vine.number().min(1).max(50),
        allowOptionQuantities: vine.boolean(),
        displayOrder: vine.number().min(0).optional(),
      }),
    ),
  }),
)
