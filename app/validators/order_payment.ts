import vine from "@vinejs/vine";
import { Decimal } from "decimal.js";

/**
 * Validador para la creación de un pago de orden.
 * Todos los campos requeridos deben estar presentes.
 */
export const createOrderPaymentValidator = (
  companyId: number,
  locationId: number,
) =>
  vine.compile(
    vine.object({
      orderId: vine.number().exists(async (db, value) => {
        // Validar que la orden existe, pertenece a la compañía/ubicación y no está pagada
        return await db
          .from("orders")
          .where("id", value)
          .where("company_id", companyId)
          .where("location_id", locationId)
          .whereNotIn("status", ["cancelled"])
          .first();
      }),
      movementType: vine.enum(["sale", "withdrawal"]),
      amount: vine
        .string()
        .regex(/^-?\d+(\.\d{1,2})?$/) // Permite números negativos
        .transform((value: string) =>
          new Decimal(value).toDecimalPlaces(2).toNumber(),
        )
        .optional()
        .requiredWhen((field) => {
          return field.parent.movementType === "withdrawal";
        }),
      paymentMethodId: vine.number().exists(async (db, value) => {
        // Validar que el método de pago existe y pertenece a la compañía
        return await db
          .from("payment_methods")
          .where("id", value)
          .where("company_id", companyId)
          .where("is_active", true)
          .first();
      }),

      referenceNumber: vine.string().trim().maxLength(100).optional(),

      processedAt: vine
        .date({
          formats: ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss.SSSZ"],
        })
        .optional(), // Si no se provee, se usará el default de la DB
      notes: vine.string().trim().minLength(3).maxLength(500).optional(),

      adjustments: vine
        .array(
          vine.object({
            type: vine.enum(["charge", "discount"]),

            description: vine.string().trim().minLength(1).maxLength(255),

            amount: vine.number().positive(),
          }),
        )
        .optional(),
    }),
  );

/**
 * Validador para la actualización de un pago de orden.
 * Solo algunos campos pueden ser actualizados después de crear el pago.
 */
// export const updateOrderPaymentValidator = (companyId: number, locationId: number) => vine.compile(
//     vine.object({

//         referenceNumber: vine
//             .string()
//             .trim()
//             .maxLength(100)
//             .optional()
//     })
// )

/**
 * Validador para procesar múltiples pagos de una orden
 * (útil para órdenes que se pagan con múltiples métodos)
 */
export const createMultipleOrderPaymentsValidator = (
  companyId: number,
  locationId: number,
) =>
  vine.compile(
    vine.object({
      orderId: vine.number().exists(async (db, value) => {
        return await db
          .from("orders")
          .where("id", value)
          .where("company_id", companyId)
          .where("location_id", locationId)
          .first();
      }),
      movementType: vine.enum(["sale", "withdrawal"]),
      payments: vine
        .array(
          vine.object({
            paymentMethodId: vine.number().exists(async (db, value) => {
              return await db
                .from("payment_methods")
                .where("id", value)
                .where("company_id", companyId)
                .first();
            }),

            referenceNumber: vine.string().trim().maxLength(100).optional(),
          }),
        )
        .minLength(1), // Al menos un pago

      processedAt: vine
        .date({
          formats: ["YYYY-MM-DD HH:mm:ss", "YYYY-MM-DDTHH:mm:ss.SSSZ"],
        })
        .optional(),
    }),
  );
