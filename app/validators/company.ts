import vine from '@vinejs/vine'

/**
 * Valida la creación de una nueva compañía.
 */
export const createCompanyValidator = vine.compile(
  vine.object({
    businessCode: vine
      .string()
      .trim()
      .minLength(3)
      .unique(async (db, value) => {
        const company = await db.from('companies').where('business_code', value).first()
        return !company
      }),
    name: vine.string().trim().minLength(3),
    address: vine.string().optional(),
    phone: vine.string().optional(),
    email: vine.string().email().optional(),
    logoUrl: vine.string().url().optional(),
    subscriptionPlan: vine.enum(['basic', 'premium', 'enterprise']),
    subscriptionStatus: vine.enum(['active', 'suspended', 'cancelled']).optional(),
    maxLocations: vine.number().positive().optional(),
  })
)

/**
 * Valida la actualización de una compañía existente.
 * Las reglas son más flexibles, por ejemplo, el businessCode no se puede cambiar.
 */
export const updateCompanyValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(3).optional(),
    address: vine.string().optional(),
    phone: vine.string().optional(),
    email: vine.string().email().optional(),
    logoUrl: vine.string().url().optional(),
    subscriptionPlan: vine.enum(['basic', 'premium', 'enterprise']).optional(),
    subscriptionStatus: vine.enum(['active', 'suspended', 'cancelled']).optional(),
    maxLocations: vine.number().positive().optional(),
  })
)
