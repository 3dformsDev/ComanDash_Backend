import vine from '@vinejs/vine'
import Location from '#models/location'

// Función de validación personalizada para verificar que location pertenezca a la company
const locationBelongsToCompany = vine.createRule(async (value: unknown, options: { companyId: number }, field) => {
  if (typeof value !== 'number') {
    field.report('The {{ field }} must be a number', 'locationBelongsToCompany', field)
    return
  }

  const location = await Location.query()
    .where('id', value)
    .where('company_id', options.companyId)
    .first()

  if (!location) {
    field.report('The selected location does not exist or does not belong to your company', 'locationBelongsToCompany', field)
  }
})

// Función para crear validador con companyId
export const createTableValidatorWithCompany = (companyId: number) => {
  return vine.compile(
    vine.object({
      locationId: vine.number().positive().use(locationBelongsToCompany({ companyId })),
      tableNumber: vine.string().trim().minLength(1).maxLength(50),
      capacity: vine.number().positive().min(1).max(100).optional(),
      zone: vine.string().trim().maxLength(100).optional().nullable(),
      isActive: vine.boolean().optional(),
    })
  )
}

// Función para crear validador de actualización con companyId
export const updateTableValidatorWithCompany = (companyId: number) => {
  return vine.compile(
    vine.object({
      locationId: vine.number().positive().use(locationBelongsToCompany({ companyId })).optional(),
      tableNumber: vine.string().trim().minLength(1).maxLength(50).optional(),
      capacity: vine.number().positive().min(1).max(100).optional(),
      zone: vine.string().trim().maxLength(100).optional().nullable(),
      isActive: vine.boolean().optional(),
    })
  )
}