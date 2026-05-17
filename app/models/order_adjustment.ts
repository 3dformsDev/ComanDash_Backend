import { DateTime } from "luxon";
import { BaseModel, belongsTo, column } from "@adonisjs/lucid/orm";

import type { BelongsTo } from "@adonisjs/lucid/types/relations";

import Order from "#models/order";

export default class OrderAdjustment extends BaseModel {
  @column({ isPrimary: true })
  declare id: number;

  @column()
  declare orderId: number;

  @column()
  declare type: "charge" | "discount";

  @column()
  declare description: string;

  @column()
  declare amount: number;

  @column.dateTime({
    autoCreate: true,
  })
  declare createdAt: DateTime;

  @column.dateTime({
    autoCreate: true,
    autoUpdate: true,
  })
  declare updatedAt: DateTime;

  @belongsTo(() => Order)
  declare order: BelongsTo<typeof Order>;
}
