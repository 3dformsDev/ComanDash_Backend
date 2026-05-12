// app/Validators/sales_report.ts
import vine from '@vinejs/vine'

/**
 * Valida los query params para el reporte de ventas.
 */
export const salesReportValidator = vine.compile(
    vine.object({
        // vine.date() automáticamente parsea la fecha ISO
        startDate: vine.date(),

        // La fecha de fin debe ser posterior o igual a la de inicio
        endDate: vine.date().afterOrEqual((field) => {
            return field.parent.startDate
        })
    })
)