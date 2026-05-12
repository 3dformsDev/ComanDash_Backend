import vine from '@vinejs/vine'

/**
 * Validator para el login de usuarios
 */
export const loginValidator = vine.compile(
  vine.object({
    username: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(100),
    password: vine
      .string()
      .minLength(6),
    business_code: vine
      .string()
      .trim()
      .minLength(3)
  })
)

/**
 * Validator para el registro de usuarios
 */
export const registerValidator = vine.compile(
  vine.object({
    company_id: vine
      .number()
      .positive(),
    location_id: vine
      .number()
      .positive()
      .optional(),
    role_id: vine
      .number()
      .positive(),
    username: vine
      .string()
      .trim()
      .minLength(3)
      .maxLength(100),
    email: vine
      .string()
      .email()
      .maxLength(100)
      .optional(),
    password: vine
      .string()
      .minLength(6)
      .maxLength(255),
    full_name: vine
      .string()
      .trim()
      .minLength(2)
      .maxLength(255)
  })
)