import {
  BUSINESS_TIME_ZONE,
  getBusinessDateRange,
  getBusinessDayCutoffHour,
  operationalDateTimeExpression,
  utcColumnInBusinessTime,
} from "#services/reports/business_day_service";
import {
  buildDailyOrdersReport,
  buildSalesReport,
  businessDateFilter,
} from "#services/reports/sales_reporting_service";
import {
  dailyOrdersReportValidator,
  salesReportValidator,
} from "#validators/sales_report";
import type { HttpContext } from "@adonisjs/core/http";
import db from "@adonisjs/lucid/services/db";

export default class ReportsController {
  public async dailyOrdersReport({
    request,
    response,
    companyId,
    locationId,
  }: HttpContext) {
    const { date } = await request.validateUsing(dailyOrdersReportValidator);

    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    try {
      const cutoffHour = await getBusinessDayCutoffHour(
        companyId,
        locationId,
      );
      const report = await buildDailyOrdersReport(
        companyId,
        locationId,
        date,
        cutoffHour,
      );

      return response.ok({
        status: "success",
        data: report,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        return response.badRequest({ message: error.message });
      }

      console.error("Error generando reporte diario de comandas:", error);
      return response.internalServerError({
        message: "Ocurrio un error al procesar el reporte diario.",
      });
    }
  }

  public async salesReport({
    request,
    response,
    companyId,
    locationId,
  }: HttpContext) {
    const { startDate, endDate } = await request.validateUsing(
      salesReportValidator,
    );

    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    try {
      const cutoffHour = await getBusinessDayCutoffHour(
        companyId,
        locationId,
      );
      const report = await buildSalesReport(
        companyId,
        locationId,
        startDate,
        endDate,
        cutoffHour,
      );

      return response.ok({
        status: "success",
        data: report,
      });
    } catch (error) {
      if (error instanceof RangeError) {
        return response.badRequest({ message: error.message });
      }

      console.error("Error generando reporte:", error);
      return response.internalServerError({
        message: "Ocurrio un error al procesar el reporte.",
      });
    }
  }

  public async peakTimesReport({
    request,
    response,
    companyId,
    locationId,
  }: HttpContext) {
    const { startDate, endDate } = await request.validateUsing(
      salesReportValidator,
    );

    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    try {
      const cutoffHour = await getBusinessDayCutoffHour(
        companyId,
        locationId,
      );
      const range = getBusinessDateRange(startDate, endDate, cutoffHour);
      const createdAtInBusinessTime =
        utcColumnInBusinessTime("orders.created_at");
      const createdAtInOperationalTime = operationalDateTimeExpression(
        "orders.created_at",
        cutoffHour,
      );

      const peakHoursQuery = db
        .from("orders")
        .where("company_id", companyId)
        .where("location_id", locationId)
        .where("status", "paid")
        .whereNotNull("paid_at")
        .whereRaw(
          ...businessDateFilter(
            "orders.business_date",
            "orders.created_at",
            range,
          ),
        )
        .whereRaw(
          `(orders.business_date IS NULL OR orders.business_date = DATE(${createdAtInOperationalTime}))`,
        )
        .groupByRaw(`HOUR(${createdAtInBusinessTime})`)
        .select(
          db.raw(`HOUR(${createdAtInBusinessTime}) as hour`),
          db.raw("COUNT(id) as orderCount"),
        )
        .orderBy("hour", "asc");

      const peakDaysQuery = db
        .from("orders")
        .where("company_id", companyId)
        .where("location_id", locationId)
        .where("status", "paid")
        .whereNotNull("paid_at")
        .whereRaw(
          ...businessDateFilter(
            "orders.business_date",
            "orders.created_at",
            range,
          ),
        )
        .whereRaw(
          `(orders.business_date IS NULL OR orders.business_date = DATE(${createdAtInOperationalTime}))`,
        )
        .groupByRaw(`DAYOFWEEK(${createdAtInOperationalTime})`)
        .groupByRaw(`DAYNAME(${createdAtInOperationalTime})`)
        .select(
          db.raw(`DAYOFWEEK(${createdAtInOperationalTime}) as dayIndex`),
          db.raw(`DAYNAME(${createdAtInOperationalTime}) as dayName`),
          db.raw("COUNT(id) as orderCount"),
        )
        .orderBy("dayIndex", "asc");

      const [peakHours, peakDays] = await Promise.all([
        peakHoursQuery,
        peakDaysQuery,
      ]);

      return response.ok({
        status: "success",
        data: {
          businessTimeZone: BUSINESS_TIME_ZONE,
          businessDayCutoffHour: cutoffHour,
          peakHours,
          peakDays,
        },
      });
    } catch (error) {
      if (error instanceof RangeError) {
        return response.badRequest({ message: error.message });
      }

      console.error("Error generando reporte de picos:", error);
      return response.internalServerError({
        message: "Ocurrio un error al procesar el reporte de picos.",
      });
    }
  }
}
