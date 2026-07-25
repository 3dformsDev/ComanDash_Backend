import CompanySetting from "#models/company_setting";
import { DateTime } from "luxon";

export const BUSINESS_TIME_ZONE = "America/Bogota";
export const BUSINESS_UTC_OFFSET = "-05:00";
export const DEFAULT_BUSINESS_DAY_CUTOFF_HOUR = 4;
export const MIN_BUSINESS_DAY_CUTOFF_HOUR = 0;
export const MAX_BUSINESS_DAY_CUTOFF_HOUR = 23;

export interface BusinessDateRange {
  startDate: string;
  endDate: string;
  startSql: string;
  endSql: string;
  cutoffHour: number;
}

export function isValidBusinessDayCutoffHour(value: unknown): boolean {
  const parsed = Number(value);

  return (
    Number.isInteger(parsed) &&
    parsed >= MIN_BUSINESS_DAY_CUTOFF_HOUR &&
    parsed <= MAX_BUSINESS_DAY_CUTOFF_HOUR
  );
}

export function normalizeBusinessDayCutoffHour(value: unknown): number {
  return isValidBusinessDayCutoffHour(value)
    ? Number(value)
    : DEFAULT_BUSINESS_DAY_CUTOFF_HOUR;
}

export function getBusinessDaySettingKey(locationId: number): string {
  return `business_day_cutoff_hour_location_${locationId}`;
}

export function utcColumnInBusinessTime(column: string): string {
  return `CONVERT_TZ(${column}, '+00:00', '${BUSINESS_UTC_OFFSET}')`;
}

export function operationalDateTimeExpression(
  column: string,
  cutoffHour: number,
): string {
  const normalizedCutoff = normalizeBusinessDayCutoffHour(cutoffHour);

  return `DATE_SUB(${utcColumnInBusinessTime(column)}, INTERVAL ${normalizedCutoff} HOUR)`;
}

export function getCurrentBusinessDate(
  cutoffHour: number,
  now: DateTime = DateTime.now(),
): string {
  const normalizedCutoff = normalizeBusinessDayCutoffHour(cutoffHour);

  return now
    .setZone(BUSINESS_TIME_ZONE)
    .minus({ hours: normalizedCutoff })
    .toISODate()!;
}

export function getBusinessDateRange(
  startDate: string,
  endDate: string,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
): BusinessDateRange {
  const normalizedCutoff = normalizeBusinessDayCutoffHour(cutoffHour);
  const start = DateTime.fromISO(startDate, { zone: BUSINESS_TIME_ZONE });
  const end = DateTime.fromISO(endDate, { zone: BUSINESS_TIME_ZONE });

  if (!start.isValid || !end.isValid || end.startOf("day") < start.startOf("day")) {
    throw new RangeError("El rango de fechas no es valido.");
  }

  const operationalStart = start
    .startOf("day")
    .plus({ hours: normalizedCutoff });
  const operationalEnd = end
    .startOf("day")
    .plus({ days: 1, hours: normalizedCutoff })
    .minus({ seconds: 1 });

  return {
    startDate: start.toISODate()!,
    endDate: end.toISODate()!,
    startSql: operationalStart.toUTC().toFormat("yyyy-MM-dd HH:mm:ss"),
    endSql: operationalEnd.toUTC().toFormat("yyyy-MM-dd HH:mm:ss"),
    cutoffHour: normalizedCutoff,
  };
}

export async function getBusinessDayCutoffHour(
  companyId: number,
  locationId: number,
): Promise<number> {
  const setting = await CompanySetting.query()
    .where("company_id", companyId)
    .where("setting_key", getBusinessDaySettingKey(locationId))
    .first();

  return normalizeBusinessDayCutoffHour(setting?.settingValue);
}

export async function saveBusinessDayCutoffHour(
  companyId: number,
  locationId: number,
  cutoffHour: number,
): Promise<number> {
  if (!isValidBusinessDayCutoffHour(cutoffHour)) {
    throw new RangeError("La hora de inicio debe estar entre 0 y 23.");
  }

  const settingKey = getBusinessDaySettingKey(locationId);
  const setting = await CompanySetting.query()
    .where("company_id", companyId)
    .where("setting_key", settingKey)
    .first();

  if (setting) {
    setting.settingValue = String(cutoffHour);
    setting.dataType = "number";
    await setting.save();
  } else {
    await CompanySetting.create({
      companyId,
      settingKey,
      settingValue: String(cutoffHour),
      dataType: "number",
    });
  }

  return cutoffHour;
}
