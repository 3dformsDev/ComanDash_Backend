import vine from "@vinejs/vine";

export const businessDaySettingValidator = vine.compile(
  vine.object({
    cutoffHour: vine.number().withoutDecimals().range([0, 23]),
  }),
);
