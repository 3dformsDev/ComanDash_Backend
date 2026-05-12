import vine from '@vinejs/vine'

/**
 * Valida la creación de una nueva sucursal.
 */
export const createLocationValidator = vine.compile(
  vine.object({
    // El companyId no se valida aquí porque lo tomaremos de la URL para mayor seguridad.
    name: vine.string().trim().minLength(3),
    address: vine.string().optional(),
    phone: vine.string().optional(),
    isMain: vine.boolean().optional(),
    isActive: vine.boolean().optional(),
  })
)

/**
 * Valida la actualización de una sucursal existente.
 * Todas las propiedades son opcionales.
 */
export const updateLocationValidator = vine.compile(
  vine.object({
    name: vine.string().trim().minLength(3).optional(),
    address: vine.string().optional(),
    phone: vine.string().optional(),
    isMain: vine.boolean().optional(),
    isActive: vine.boolean().optional(),
  })
)
