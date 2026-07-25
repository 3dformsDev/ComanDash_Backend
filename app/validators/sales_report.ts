// app/Validators/sales_report.ts
import vine from "@vinejs/vine";

/**
 * Valida los query params para el reporte de ventas.
 */
export const salesReportValidator = vine.compile(
  vine.object({
    startDate: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: vine.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
);
