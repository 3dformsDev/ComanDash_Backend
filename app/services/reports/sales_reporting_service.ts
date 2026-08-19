import Order from "#models/order";
import {
  BUSINESS_TIME_ZONE,
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  getBusinessDateRange,
  operationalDateTimeExpression,
} from "#services/reports/business_day_service";
import db from "@adonisjs/lucid/services/db";

export {
  BUSINESS_TIME_ZONE,
  BUSINESS_UTC_OFFSET,
  getBusinessDateRange,
  utcColumnInBusinessTime,
} from "#services/reports/business_day_service";

function toNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function businessDateFilter(
  businessDateColumn: string,
  timestampColumn: string,
  range: {
    startDate: string;
    endDate: string;
    startSql: string;
    endSql: string;
  },
): [string, Array<string>] {
  return [
    `(${businessDateColumn} BETWEEN ? AND ? OR (${businessDateColumn} IS NULL AND ${timestampColumn} BETWEEN ? AND ?))`,
    [range.startDate, range.endDate, range.startSql, range.endSql],
  ];
}

export async function buildSalesReport(
  companyId: number,
  locationId: number,
  startDate: string,
  endDate: string,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
) {
  const range = getBusinessDateRange(startDate, endDate, cutoffHour);
  const paidAtInOperationalTime = operationalDateTimeExpression(
    "orders.paid_at",
    range.cutoffHour,
  );
  const paidBusinessDateExpression =
    `COALESCE(orders.paid_business_date, DATE(${paidAtInOperationalTime}))`;

  const totalsQuery = db
    .from("orders")
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .where("orders.status", "paid")
    .whereNotNull("orders.paid_at")
    .whereRaw(
      ...businessDateFilter(
        "orders.paid_business_date",
        "orders.paid_at",
        range,
      ),
    )
    .select(
      db.raw("COUNT(orders.id) as totalOrders"),
      db.raw("COALESCE(SUM(orders.total_amount), 0) as totalSales"),
      db.raw(
        "SUM(CASE WHEN orders.order_type = 'dine_in' THEN 1 ELSE 0 END) as tableOrders",
      ),
      db.raw(
        "SUM(CASE WHEN orders.order_type = 'takeaway' THEN 1 ELSE 0 END) as takeawayOrders",
      ),
    )
    .first();

  const productsSubtotalQuery = db
    .from("order_items")
    .join("orders", "order_items.order_id", "orders.id")
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .where("orders.status", "paid")
    .whereNotNull("orders.paid_at")
    .whereRaw(
      ...businessDateFilter(
        "orders.paid_business_date",
        "orders.paid_at",
        range,
      ),
    )
    .sum("order_items.total_price as total")
    .first();

  const adjustmentsQuery = db
    .from("order_adjustments")
    .join("orders", "order_adjustments.order_id", "orders.id")
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .where("orders.status", "paid")
    .whereNotNull("orders.paid_at")
    .whereRaw(
      ...businessDateFilter(
        "orders.paid_business_date",
        "orders.paid_at",
        range,
      ),
    )
    .groupBy("order_adjustments.type")
    .select("order_adjustments.type")
    .sum("order_adjustments.amount as total");

  const paymentTotalsQuery = db
    .from("order_payments")
    .join("orders", "order_payments.order_id", "orders.id")
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .whereRaw(
      ...businessDateFilter(
        "order_payments.business_date",
        "order_payments.processed_at",
        range,
      ),
    )
    .select(
      db.raw(
        "COALESCE(SUM(CASE WHEN order_payments.amount > 0 THEN order_payments.amount ELSE 0 END), 0) as paymentsReceived",
      ),
      db.raw(
        "COALESCE(SUM(CASE WHEN order_payments.amount < 0 THEN ABS(order_payments.amount) ELSE 0 END), 0) as refunds",
      ),
      db.raw("COALESCE(SUM(order_payments.amount), 0) as netPayments"),
    )
    .first();

  const paymentMethodsQuery = db
    .from("order_payments")
    .join("orders", "order_payments.order_id", "orders.id")
    .join(
      "payment_methods",
      "order_payments.payment_method_id",
      "payment_methods.id",
    )
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .whereRaw(
      ...businessDateFilter(
        "order_payments.business_date",
        "order_payments.processed_at",
        range,
      ),
    )
    .groupBy("payment_methods.id", "payment_methods.name")
    .select(
      "payment_methods.id",
      "payment_methods.name",
      db.raw(
        "COALESCE(SUM(CASE WHEN order_payments.amount > 0 THEN order_payments.amount ELSE 0 END), 0) as received",
      ),
      db.raw(
        "COALESCE(SUM(CASE WHEN order_payments.amount < 0 THEN ABS(order_payments.amount) ELSE 0 END), 0) as refunded",
      ),
      db.raw("COALESCE(SUM(order_payments.amount), 0) as net"),
    )
    .orderBy("payment_methods.name", "asc");

  const dailySalesQuery = db
    .from("orders")
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .where("orders.status", "paid")
    .whereNotNull("orders.paid_at")
    .whereRaw(
      ...businessDateFilter(
        "orders.paid_business_date",
        "orders.paid_at",
        range,
      ),
    )
    .groupByRaw(paidBusinessDateExpression)
    .select(
      db.raw(`${paidBusinessDateExpression} as day`),
      db.raw("COUNT(orders.id) as orderCount"),
      db.raw("COALESCE(SUM(orders.total_amount), 0) as total"),
    )
    .orderBy("day", "asc");

  const chartDataQuery = db
    .from("categories")
    .join("products", "categories.id", "products.category_id")
    .join("order_items", "products.id", "order_items.product_id")
    .join("orders", "order_items.order_id", "orders.id")
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .where("orders.status", "paid")
    .whereNotNull("orders.paid_at")
    .whereRaw(
      ...businessDateFilter(
        "orders.paid_business_date",
        "orders.paid_at",
        range,
      ),
    )
    .groupBy("categories.id", "categories.name")
    .select("categories.name as label")
    .sum("order_items.total_price as total")
    .orderBy("total", "desc");

  const tableRowsQuery = db
    .from("products")
    .join("categories", "products.category_id", "categories.id")
    .join("order_items", "products.id", "order_items.product_id")
    .join("orders", "order_items.order_id", "orders.id")
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .where("orders.status", "paid")
    .whereNotNull("orders.paid_at")
    .whereRaw(
      ...businessDateFilter(
        "orders.paid_business_date",
        "orders.paid_at",
        range,
      ),
    )
    .groupBy("products.id", "products.name", "categories.id", "categories.name")
    .select(
      "products.name as productName",
      "categories.name as category",
    )
    .sum("order_items.quantity as quantity")
    .sum("order_items.total_price as total")
    .orderBy("total", "desc")
    .limit(100);

  const cutsQuery = db
    .from("orders")
    .join(
      "cash_register_sessions",
      "orders.cash_register_session_id",
      "cash_register_sessions.id",
    )
    .join(
      "cash_registers",
      "cash_register_sessions.cash_register_id",
      "cash_registers.id",
    )
    .where("orders.company_id", companyId)
    .where("orders.location_id", locationId)
    .where("orders.status", "paid")
    .whereNotNull("orders.paid_at")
    .whereRaw(
      ...businessDateFilter(
        "orders.paid_business_date",
        "orders.paid_at",
        range,
      ),
    )
    .groupBy(
      "cash_register_sessions.id",
      "cash_register_sessions.status",
      "cash_register_sessions.opened_at",
      "cash_register_sessions.closed_at",
      "cash_registers.name",
    )
    .select(
      "cash_register_sessions.id as sessionId",
      "cash_register_sessions.status",
      db.raw(
        "DATE_FORMAT(cash_register_sessions.opened_at, '%Y-%m-%dT%H:%i:%s-05:00') as openedAt",
      ),
      db.raw(
        "CASE WHEN cash_register_sessions.closed_at IS NULL THEN NULL ELSE CONCAT(DATE_FORMAT(cash_register_sessions.closed_at, '%Y-%m-%dT%H:%i:%s'), 'Z') END as closedAt",
      ),
      "cash_registers.name as cashRegisterName",
      db.raw("COUNT(orders.id) as orderCount"),
      db.raw("COALESCE(SUM(orders.total_amount), 0) as totalSales"),
    )
    .orderBy("cash_register_sessions.opened_at", "asc");

  const cancelledOrdersQuery = db
    .from("orders")
    .where("company_id", companyId)
    .where("location_id", locationId)
    .where("status", "cancelled")
    .whereNotNull("cancelled_at")
    .whereRaw(
      ...businessDateFilter(
        "cancelled_business_date",
        "cancelled_at",
        range,
      ),
    )
    .count("id as total")
    .first();

  const inProcessOrdersQuery = db
    .from("orders")
    .where("company_id", companyId)
    .where("location_id", locationId)
    .whereNotIn("status", ["paid", "cancelled"])
    .whereRaw(
      ...businessDateFilter("business_date", "created_at", range),
    )
    .count("id as total")
    .first();

  const [
    totals,
    productsSubtotal,
    adjustments,
    paymentTotals,
    paymentMethods,
    dailySales,
    chartData,
    tableRows,
    cuts,
    cancelledOrders,
    inProcessOrders,
  ] = await Promise.all([
    totalsQuery,
    productsSubtotalQuery,
    adjustmentsQuery,
    paymentTotalsQuery,
    paymentMethodsQuery,
    dailySalesQuery,
    chartDataQuery,
    tableRowsQuery,
    cutsQuery,
    cancelledOrdersQuery,
    inProcessOrdersQuery,
  ]);

  const adjustmentsByType = adjustments.reduce(
    (result: Record<string, number>, adjustment: any) => {
      result[adjustment.type] = toNumber(adjustment.total);
      return result;
    },
    {},
  );

  return {
    businessTimeZone: BUSINESS_TIME_ZONE,
    businessDayCutoffHour: range.cutoffHour,
    range: {
      startDate: range.startDate,
      endDate: range.endDate,
    },
    summary: {
      totalOrders: toNumber(totals?.totalOrders),
      tableOrders: toNumber(totals?.tableOrders),
      takeawayOrders: toNumber(totals?.takeawayOrders),
      productsSubtotal: toNumber(productsSubtotal?.total),
      charges: adjustmentsByType.charge || 0,
      discounts: adjustmentsByType.discount || 0,
      totalSales: toNumber(totals?.totalSales),
      paymentsReceived: toNumber(paymentTotals?.paymentsReceived),
      refunds: toNumber(paymentTotals?.refunds),
      netPayments: toNumber(paymentTotals?.netPayments),
      cancelledOrders: toNumber(cancelledOrders?.total),
      inProcessOrders: toNumber(inProcessOrders?.total),
    },
    chartData: chartData.map((row: any) => ({
      label: row.label,
      total: toNumber(row.total),
    })),
    tableRows: tableRows.map((row: any) => ({
      productName: row.productName,
      category: row.category,
      quantity: toNumber(row.quantity),
      total: toNumber(row.total),
    })),
    dailySales: dailySales.map((row: any) => ({
      day: row.day,
      orderCount: toNumber(row.orderCount),
      total: toNumber(row.total),
    })),
    paymentMethods: paymentMethods.map((row: any) => ({
      id: toNumber(row.id),
      name: row.name,
      received: toNumber(row.received),
      refunded: toNumber(row.refunded),
      net: toNumber(row.net),
    })),
    cuts: cuts.map((row: any) => ({
      sessionId: toNumber(row.sessionId),
      status: row.status,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      cashRegisterName: row.cashRegisterName,
      orderCount: toNumber(row.orderCount),
      totalSales: toNumber(row.totalSales),
    })),
  };
}

export async function getPaidOrdersForRange(
  companyId: number,
  locationId: number,
  startDate: string,
  endDate: string,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
) {
  const range = getBusinessDateRange(startDate, endDate, cutoffHour);

  return Order.query()
    .where("company_id", companyId)
    .where("location_id", locationId)
    .where("status", "paid")
    .whereNotNull("paid_at")
    .whereRaw(
      ...businessDateFilter("paid_business_date", "paid_at", range),
    )
    .preload("orderItems", (query) =>
      query.preload("product", (productQuery) =>
        productQuery.preload("category"),
      ),
    )
    .preload("waiter")
    .preload("table")
    .preload("payments", (query) =>
      query.preload("paymentMethod", (paymentMethodQuery) =>
        paymentMethodQuery.select("id", "name", "type"),
      ),
    )
    .preload("adjustments")
    .orderBy("paid_at", "desc");
}

export async function getCancelledOrdersForRange(
  companyId: number,
  locationId: number,
  startDate: string,
  endDate: string,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
) {
  const range = getBusinessDateRange(startDate, endDate, cutoffHour);

  return Order.query()
    .where("company_id", companyId)
    .where("location_id", locationId)
    .where("status", "cancelled")
    .whereNotNull("cancelled_at")
    .whereRaw(
      ...businessDateFilter(
        "cancelled_business_date",
        "cancelled_at",
        range,
      ),
    )
    .preload("orderItems", (query) =>
      query.preload("product", (productQuery) =>
        productQuery.preload("category"),
      ),
    )
    .preload("waiter")
    .preload("table")
    .preload("payments", (query) =>
      query.preload("paymentMethod", (paymentMethodQuery) =>
        paymentMethodQuery.select("id", "name", "type"),
      ),
    )
    .preload("adjustments")
    .orderBy("cancelled_at", "desc");
}

export async function buildDailyOrdersReport(
  companyId: number,
  locationId: number,
  businessDate: string,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
) {
  const [report, paidOrders, cancelledOrders] = await Promise.all([
    buildSalesReport(
      companyId,
      locationId,
      businessDate,
      businessDate,
      cutoffHour,
    ),
    getPaidOrdersForRange(
      companyId,
      locationId,
      businessDate,
      businessDate,
      cutoffHour,
    ),
    getCancelledOrdersForRange(
      companyId,
      locationId,
      businessDate,
      businessDate,
      cutoffHour,
    ),
  ]);

  return {
    ...report,
    businessDate,
    paidOrders,
    cancelledOrders,
  };
}
