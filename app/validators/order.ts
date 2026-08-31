import vine from "@vinejs/vine";

const modifierSelectionsSchema = vine
  .array(
    vine.object({
      modifierGroupId: vine.number().positive(),
      modifierOptionId: vine.number().positive(),
      quantity: vine.number().min(1),
    }),
  )
  .optional();

/**
 * Validador para la creación de una orden.
 * Los campos son mayormente requeridos.
 */
export const createOrderValidator = (companyId: number, locationId: number) =>
  vine.compile(
    vine.object({
      // El tableId es opcional en el modelo, pero debe existir en la DB si se provee.
      customerName: vine.string().trim().maxLength(255).optional(),
      kitchenNotes: vine.string().trim().optional(),
      orderType: vine.enum(["dine_in", "takeaway"]),
      tableId: vine
        .number()
        .exists(async (db, value) => {
          // Lógica de negocio: Asegurarse de que la mesa existe.
          // En un escenario real, también validarías que pertenezca a la companyId actual.
          return await db
            .from("tables")
            .where("id", value)
            .where("company_id", companyId)
            .where("location_id", locationId)
            .first();
        })
        .optional()
        .requiredWhen((field) => {
          return field.parent.orderType === "dine_in";
        }),
      isPrepaid: vine.boolean().optional(), // El backend puede default a false si no se envía
      isAdvancePayment: vine.boolean(),
      paymentMethodId: vine
        .number()
        .exists(async (db, value) => {
          const result = await db
            .from("payment_methods")
            .where("id", value)
            .where("company_id", companyId)
            .where("is_active", true)
            .first();

          return !!result;
        })
        .optional()
        .requiredWhen((field) => {
          return (
            field.parent.isAdvancePayment === true &&
            (!Array.isArray(field.parent.advancePayments) ||
              field.parent.advancePayments.length === 0)
          );
        }),

      notesPayment: vine.string().optional(),

      advancePayments: vine
        .array(
          vine.object({
            paymentMethodId: vine.number().exists(async (db, value) => {
              const result = await db
                .from("payment_methods")
                .where("id", value)
                .where("company_id", companyId)
                .where("is_active", true)
                .first();

              return !!result;
            }),
            amount: vine.number().min(1),
            notesPayment: vine.string().optional(),
          }),
        )
        .optional(),

      adjustments: vine
        .array(
          vine.object({
            type: vine.enum(["charge", "discount"]),
            description: vine.string().trim(),
            amount: vine.number(),
          }),
        )
        .optional(),

      // NOTA REALISTA: En una aplicación real, no enviarías los totales directamente.
      // Enviarías un array de 'orderItems' y el backend los calcularía.
      // Ejemplo de cómo se vería:
      orderItems: vine
        .array(
          vine.object({
            productId: vine.number().exists(async (db, value) => {
              return await db
                .from("products")
                .where("id", value)
                .where("company_id", companyId)
                .first();
            }),
            quantity: vine.number().min(1),
            modifierSelections: modifierSelectionsSchema,
            // price: ... (se obtendría del producto en el backend)/*  */
          }),
        )
        .minLength(1), // Una orden debe tener al menos un producto.

      // Por simplicidad, y siguiendo el modelo, validamos los totales enviados.
      // subtotal: vine.number().min(0),
      serviceFee: vine.number().min(0).optional(),
      tipAmount: vine.number().min(0).optional(),
      // totalAmount: vine.number().min(0),
    }),
  );

/**
 * Validador para la actualización de una orden.
 * La mayoría de los campos son opcionales, ya que solo se actualiza
 * lo que cambia (ej. solo el estado).
 */
export const updateOrderValidator = (companyId: number, locationId: number) =>
  vine.compile(
    vine.object({
      // Hacemos todos los campos opcionales para la actualización
      tableId: vine
        .number()
        .exists(async (db, value) => {
          return await db
            .from("tables")
            .where("id", value)
            .where("company_id", companyId)
            .where("location_id", locationId)
            .first();
        })
        .optional()
        .requiredWhen((field) => {
          return field.parent.orderType === "dine_in";
        }),

      customerName: vine.string().trim().maxLength(255).optional(),
      kitchenNotes: vine.string().trim().optional(),
      isAdvancePayment: vine.boolean().optional(),
      // NOTA REALISTA: En una aplicación real, no enviarías los totales directamente.
      // Enviarías un array de 'orderItems' y el backend los calcularía.
      // Ejemplo de cómo se vería:
      orderItems: vine.array(
        vine.object({
          orderItemId: vine.number().positive().optional(),
          productId: vine.number().exists(async (db, value) => {
            return await db
              .from("products")
              .where("id", value)
              .where("company_id", companyId)
              .first();
          }),
          quantity: vine.number().min(1),
          modifierSelections: modifierSelectionsSchema,
          // price: ... (se obtendría del producto en el backend)/*  */
        }),
      ),
      paymentMethodId: vine
        .number()
        .exists(async (db, value) => {
          const result = await db
            .from("payment_methods")
            .where("id", value)
            .where("company_id", companyId)
            .where("is_active", true)
            .first();
          return !!result;
        })
        .optional()
        .requiredWhen((field) => {
          return field.parent.isAdvancePayment === true;
        }),
      notesPayment: vine
        .string()
        .optional()
        .requiredWhen((field) => {
          return field.parent.isAdvancePayment === true;
        }),

      // El tipo de orden ('dine_in', 'takeaway') generalmente no se debería poder cambiar.
      // Por eso lo omitimos del validador de actualización.

      status: vine
        .enum([
          "pending",
          "received",
          "in_preparation",
          "ready",
          "served",
          "paid",
          "cancelled",
        ])
        .optional(),

      // Los totales y otros campos podrían cambiar si se añaden/quitan productos
      subtotal: vine.number().min(0).optional(),
      serviceFee: vine.number().min(0).optional(),
      tipAmount: vine.number().min(0).optional(),
      totalAmount: vine.number().min(0).optional(),
    }),
  );

/**
 * Validador para la cancelación de una orden.
 * La mayoría de los campos son opcionales, ya que solo se actualiza
 * lo que cambia (ej. solo el estado).
 */
export const cancelOrderValidator = (companyId: number) =>
  vine.compile(
    vine.object({
      // El método de pago es opcional, pero podría ser necesario para el reembolso
      paymentMethodId: vine
        .number()
        .exists(async (db, value) => {
          return await db
            .from("payment_methods")
            .where("id", value)
            .where("company_id", companyId)
            .first();
        })
        .optional(),
      reason: vine.string().optional(),
    }),
  );
