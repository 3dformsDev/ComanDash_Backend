import { DateTime } from "luxon";
import { column, belongsTo, hasMany } from "@adonisjs/lucid/orm";
import type { BelongsTo, HasMany } from "@adonisjs/lucid/types/relations";
import Company from "./company.js";
import Location from "./location.js";
import User from "./user.js";
import Table from "./table.js";
import TenantBase from "./tenant_base.js";
import CashRegisterSession from "./cash_registers_session.js";
import OrderPayment from "./order_payment.js";
import OrderItem from "./order_item.js";
import OrderAdjustment from "./order_adjustment.js";

export default class Order extends TenantBase {
  @column({ isPrimary: true })
  declare id: number;

  @column()
  declare companyId: number;

  @column()
  declare locationId: number;

  @column()
  declare orderNumber: string;

  @column()
  declare cashRegisterSessionId: number;

  @column()
  declare tableId?: number; // Opcional, ya que es nullable

  @column()
  declare customerName?: string; // Opcional, ya que es nullable

  @column()
  declare waiterId: number;

  @column()
  declare kitchenNotes?: string; // Opcional, ya que es nullable

  @column()
  declare orderType: "dine_in" | "takeaway";

  @column()
  declare status:
    | "pending"
    | "received"
    | "in_preparation"
    | "ready"
    | "served"
    | "paid"
    | "cancelled";

  @column({
    consume: (value: any) => Boolean(value), // cuando se lee de la BD → 0/1 a true/false
    prepare: (value: boolean) => (value ? 1 : 0), // cuando se guarda → true/false a 0/1
  })
  declare isAdvancePayment: boolean;

  @column({
    consume: (value: any) => Boolean(value), // cuando se lee de la BD → 0/1 a true/false
    prepare: (value: boolean) => (value ? 1 : 0), // cuando se guarda → true/false a 0/1
  })
  declare isPrepaid: boolean;

  @column({
    consume: (value: any) => Boolean(value), // cuando se lee de la BD → 0/1 a true/false
    prepare: (value: boolean) => (value ? 1 : 0), // cuando se guarda → true/false a 0/1
  })
  declare isReadyToServe: boolean;

  @column({
    consume: (value: any) => Boolean(value), // cuando se lee de la BD → 0/1 a true/false
    prepare: (value: boolean) => (value ? 1 : 0), // cuando se guarda → true/false a 0/1
  })
  declare isFreedTable: boolean;

  @column({
    consume: (value: any) => Boolean(value), // cuando se lee de la BD → 0/1 a true/false
    prepare: (value: boolean) => (value ? 1 : 0), // cuando se guarda → true/false a 0/1
  })
  declare isServed: boolean;

  @column()
  declare subtotal: number;

  @column()
  declare serviceFee: number;

  @column()
  declare tipAmount: number;

  @column()
  declare totalAmount: number;

  @column({
    consume: (value: any) => Boolean(value), // cuando se lee de la BD → 0/1 a true/false
    prepare: (value: boolean) => (value ? 1 : 0), // cuando se guarda → true/false a 0/1
  })
  declare wasModified: boolean;

  @column.dateTime()
  declare servedAt?: DateTime; // Opcional, ya que es nullable

  @column.dateTime()
  declare paidAt?: DateTime; // Opcional, ya que es nullable

  @column.dateTime()
  declare cancelledAt?: DateTime; // Opcional, ya que es nullable

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime;

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime;

  // Relaciones
  @belongsTo(() => Company)
  declare company: BelongsTo<typeof Company>;

  @belongsTo(() => Location)
  declare location: BelongsTo<typeof Location>;

  @belongsTo(() => User, { foreignKey: "waiterId" })
  declare waiter: BelongsTo<typeof User>;

  @belongsTo(() => Table)
  declare table: BelongsTo<typeof Table>;

  @belongsTo(() => CashRegisterSession)
  declare cashRegisterSession: BelongsTo<typeof CashRegisterSession>;

  @hasMany(() => OrderItem)
  declare orderItems: HasMany<typeof OrderItem>;

  @hasMany(() => OrderPayment)
  declare payments: HasMany<typeof OrderPayment>;

  @hasMany(() => OrderAdjustment)
  declare adjustments: HasMany<typeof OrderAdjustment>; //nuevo
}
