import { DateTime } from "luxon";
import { BaseModel, column } from "@adonisjs/lucid/orm";

export default class CompanyReceiptBranding extends BaseModel {
  @column({ isPrimary: true })
  declare companyId: number;

  @column({ serializeAs: null })
  declare logoData: Buffer;

  @column()
  declare mimeType: string;

  @column()
  declare sizeBytes: number;

  @column()
  declare width: number;

  @column()
  declare height: number;

  @column()
  declare checksum: string;

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime;

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime;
}
