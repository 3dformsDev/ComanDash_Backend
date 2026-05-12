import { salesReportValidator } from '#validators/sales_report'
import type { HttpContext } from '@adonisjs/core/http'
import db from "@adonisjs/lucid/services/db"
import { DateTime } from 'luxon'

export default class ReportsController {
    /**
   * Genera un reporte de ventas basado en un rango de fechas.
   * Responde con datos para gráficos (ventas por categoría) y
   * una tabla (ventas por producto).
   */
    public async salesReport({ request, response, companyId }: HttpContext) {

        // 1. Validar las fechas (startDate y endDate de los query params)
        const { startDate, endDate } = await request.validateUsing(salesReportValidator)

        // 2. Ajustar las fechas para la consulta
        // 'startDate' será el inicio del día (00:00:00)
        // 'endDate' será el final del día (23:59:59) para incluir todo el día.
        // 2. Convertir Date a DateTime de Luxon
        const startDateTime = DateTime.fromJSDate(startDate).startOf('day').toSQL() // 'YYYY-MM-DD 00:00:00'
        const endDateTime = DateTime.fromJSDate(endDate).endOf('day').toSQL()     // 'YYYY-MM-DD 23:59:59'

        // Validar que las fechas sean válidas
        if (!startDateTime || !endDateTime) {
            return response.badRequest({
                message: 'Las fechas proporcionadas no son válidas.'
            })
        }

        try {
            // 1. Consulta para Gráfico de Categorías (Sin cambios)
            const chartDataQuery = db.from('categories')
                .join('products', 'categories.id', 'products.category_id')
                .join('order_items', 'products.id', 'order_items.product_id')
                .join('orders', 'order_items.order_id', 'orders.id')
                .whereBetween('orders.created_at', [startDateTime, endDateTime])
                .where('orders.company_id', companyId)
                .groupBy('categories.name')
                .select('categories.name as label')
                .sum('order_items.total_price as total')
                .orderBy('total', 'desc')

            // 2. Consulta para Tabla de Productos (Sin cambios)
            const tableRowsQuery = db.from('products')
                // ... (joins) ...
                .join('categories', 'products.category_id', 'categories.id')
                .join('order_items', 'products.id', 'order_items.product_id')
                .join('orders', 'order_items.order_id', 'orders.id')
                .whereBetween('orders.created_at', [startDateTime, endDateTime])
                .where('orders.company_id', companyId)
                .groupBy('products.id', 'products.name', 'categories.name')
                .select(
                    'products.name as productName',
                    'categories.name as category'
                )
                .sum('order_items.quantity as quantity')
                .sum('order_items.total_price as total')
                .orderBy('total', 'desc')
                .limit(100)

            // 3. NUEVA CONSULTA: Desglose de Ventas por Día
            const dailySalesQuery = db.from('order_items')
                .join('orders', 'order_items.order_id', 'orders.id')
                .whereBetween('orders.created_at', [startDateTime, endDateTime])
                .where('orders.company_id', companyId)
                // Agrupamos por la FECHA (sin la hora)
                .groupByRaw('DATE(orders.created_at)')
                .select(
                    // Seleccionamos la fecha y la suma total
                    db.raw('DATE(orders.created_at) as day'),
                    db.raw('SUM(order_items.total_price) as total')
                )
                // Ordenamos por día para el gráfico de línea
                .orderBy('day', 'asc')


            // 4. Ejecutar LAS TRES consultas en paralelo
            const [chartData, tableRows, dailySales] = await Promise.all([
                chartDataQuery,
                tableRowsQuery,
                dailySalesQuery // Añadimos la nueva consulta
            ])

            // 5. Enviar la respuesta completa
            return response.ok({
                status: 'success', // Opcional, pero coincide con el estándar de 'ApiResponse'
                data: {
                    chartData,
                    tableRows,
                    dailySales
                }
            })

        } catch (error) {
            console.error('Error generando reporte:', error)
            return response.internalServerError({
                message: 'Ocurrió un error al procesar el reporte.'
            })
        }
    }

    /**
   * Genera un reporte de horas y días pico basado en el número de pedidos.
   */
    public async peakTimesReport({ request, response, companyId }: HttpContext) {

        // 1. Validar (reutilizamos el mismo validador de fechas)
        const { startDate, endDate } = await salesReportValidator.validate(request.all())

        const startDateTime = DateTime.fromJSDate(startDate).startOf('day').toSQL() // 'YYYY-MM-DD 00:00:00'
        const endDateTime = DateTime.fromJSDate(endDate).endOf('day').toSQL()     // 'YYYY-MM-DD 23:59:59'

        /*
         * NOTA IMPORTANTE:
         * Las funciones (HOUR, DAYOFWEEK, DAYNAME) son de MySQL.
         * Si usas PostgreSQL, deberás cambiarlas por:
         * - HOUR(created_at) -> EXTRACT(HOUR FROM created_at)
         * - DAYOFWEEK(created_at) -> EXTRACT(DOW FROM created_at) (0=Dom, 1=Lun...)
         * - DAYNAME(created_at) -> TO_CHAR(created_at, 'Day')
         */
        // Validar que las fechas sean válidas

        if (!startDateTime || !endDateTime) {
            return response.badRequest({
                message: 'Las fechas proporcionadas no son válidas.'
            })
        }

        try {

            // 2. Consulta de Horas Pico (agrupadas por hora, 0-23)
            const peakHoursQuery = db.from('orders')
                .whereBetween('created_at', [startDateTime, endDateTime])
                .where('company_id', companyId)
                .groupByRaw('HOUR(created_at)') // Agrupar por la hora
                .select(
                    db.raw('HOUR(created_at) as hour'),
                    db.raw('COUNT(id) as orderCount') // Contar pedidos
                )
                .orderBy('hour', 'asc')

            // 3. Consulta de Días Pico (agrupados por día de la semana)
            const peakDaysQuery = db.from('orders')
                .whereBetween('created_at', [startDateTime, endDateTime])
                .where('company_id', companyId)
                .groupByRaw('DAYOFWEEK(created_at)')
                .groupByRaw('DAYNAME(created_at)')
                .select(
                    db.raw('DAYOFWEEK(created_at) as dayIndex'),
                    db.raw('DAYNAME(created_at) as dayName'),
                    db.raw('COUNT(id) as orderCount')
                )
                .orderBy('dayIndex', 'asc') // Ordenar por el índice del día

            // 4. Ejecutar consultas
            const [peakHours, peakDays] = await Promise.all([
                peakHoursQuery,
                peakDaysQuery
            ])

            // 5. Enviar respuesta
            return response.ok({
                status: 'success',
                data: {
                    peakHours,
                    peakDays
                }
            })

        } catch (error) {
            console.error('Error generando reporte de picos:', error)
            return response.internalServerError({
                message: 'Ocurrió un error al procesar el reporte de picos.'
            })
        }
    }
}