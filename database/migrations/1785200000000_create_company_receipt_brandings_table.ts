import { BaseSchema } from "@adonisjs/lucid/schema";

export default class extends BaseSchema {
  protected tableName = "company_receipt_brandings";

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table
        .integer("company_id")
        .unsigned()
        .primary()
        .references("id")
        .inTable("companies")
        .onDelete("CASCADE");
      table.specificType("logo_data", "MEDIUMBLOB").notNullable();
      table.string("mime_type", 50).notNullable().defaultTo("image/png");
      table.integer("size_bytes").unsigned().notNullable();
      table.smallint("width").unsigned().notNullable();
      table.smallint("height").unsigned().notNullable();
      table.string("checksum", 64).notNullable();
      table.timestamp("created_at", { useTz: true }).notNullable().defaultTo(this.now());
      table.timestamp("updated_at", { useTz: true }).notNullable().defaultTo(this.now());
    });
  }

  async down() {
    this.schema.dropTable(this.tableName);
  }
}
