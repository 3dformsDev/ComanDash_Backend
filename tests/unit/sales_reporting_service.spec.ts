import { test } from "@japa/runner";
import {
  BUSINESS_TIME_ZONE,
  BUSINESS_UTC_OFFSET,
  DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
  getBusinessDateRange,
  getBusinessDaySettingKey,
  getCurrentBusinessDate,
  normalizeBusinessDayCutoffHour,
  operationalDateTimeExpression,
  utcColumnInBusinessTime,
} from "#services/reports/business_day_service";
import { DateTime } from "luxon";

test.group("Sales reporting business dates", () => {
  test("uses the 4 a.m. default cutoff in Colombia", ({ assert }) => {
    const range = getBusinessDateRange("2026-07-18", "2026-07-18");

    assert.equal(BUSINESS_TIME_ZONE, "America/Bogota");
    assert.equal(BUSINESS_UTC_OFFSET, "-05:00");
    assert.equal(DEFAULT_BUSINESS_DAY_CUTOFF_HOUR, 4);
    assert.equal(range.startSql, "2026-07-18 09:00:00");
    assert.equal(range.endSql, "2026-07-19 08:59:59");
    assert.equal(range.cutoffHour, 4);
  });

  test("supports midnight as a configurable cutoff", ({ assert }) => {
    const range = getBusinessDateRange("2026-07-18", "2026-07-18", 0);

    assert.equal(range.startSql, "2026-07-18 05:00:00");
    assert.equal(range.endSql, "2026-07-19 04:59:59");
    assert.equal(range.cutoffHour, 0);
  });

  test("supports a p.m. cutoff and an inclusive multi-day range", ({
    assert,
  }) => {
    const range = getBusinessDateRange("2026-07-18", "2026-07-20", 20);

    assert.equal(range.startDate, "2026-07-18");
    assert.equal(range.endDate, "2026-07-20");
    assert.equal(range.startSql, "2026-07-19 01:00:00");
    assert.equal(range.endSql, "2026-07-22 00:59:59");
  });

  test("keeps the previous business date until the cutoff", ({ assert }) => {
    const beforeCutoff = DateTime.fromISO("2026-07-23T03:59:59", {
      zone: BUSINESS_TIME_ZONE,
    });
    const atCutoff = DateTime.fromISO("2026-07-23T04:00:00", {
      zone: BUSINESS_TIME_ZONE,
    });

    assert.equal(getCurrentBusinessDate(4, beforeCutoff), "2026-07-22");
    assert.equal(getCurrentBusinessDate(4, atCutoff), "2026-07-23");
  });

  test("builds safe SQL expressions for actual and operational time", ({
    assert,
  }) => {
    assert.equal(
      utcColumnInBusinessTime("orders.paid_at"),
      "CONVERT_TZ(orders.paid_at, '+00:00', '-05:00')",
    );
    assert.equal(
      operationalDateTimeExpression("orders.paid_at", 4),
      "DATE_SUB(CONVERT_TZ(orders.paid_at, '+00:00', '-05:00'), INTERVAL 4 HOUR)",
    );
  });

  test("falls back safely and isolates settings by location", ({ assert }) => {
    assert.equal(normalizeBusinessDayCutoffHour("invalid"), 4);
    assert.equal(normalizeBusinessDayCutoffHour(24), 4);
    assert.equal(normalizeBusinessDayCutoffHour(20), 20);
    assert.equal(
      getBusinessDaySettingKey(3),
      "business_day_cutoff_hour_location_3",
    );
  });

  test("rejects an inverted range", ({ assert }) => {
    assert.throws(
      () => getBusinessDateRange("2026-07-20", "2026-07-18", 4),
      "El rango de fechas no es valido.",
    );
  });
});
