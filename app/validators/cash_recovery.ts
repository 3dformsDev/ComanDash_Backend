import vine from '@vinejs/vine'

export const authorizeCashRecoveryValidator = vine.compile(
  vine.object({
    reason: vine.string().trim().minLength(10).maxLength(500),
  }),
)
