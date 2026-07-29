import ReceiptLogoService from "#services/branding/receipt_logo_service";
import ReceiptPdfService from "#services/pdf/receipt_pdf_service";
import Order from "#models/order";
import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@japa/runner";
import { DateTime } from "luxon";
import sharp from "sharp";

test.group("Receipt logo service", () => {
  test("normalizes receipt logos to a bounded grayscale PNG", async ({
    assert,
  }) => {
    const inputPath = join(tmpdir(), `receipt-logo-${randomUUID()}.png`);

    try {
      const input = await sharp({
        create: {
          width: 1_200,
          height: 600,
          channels: 4,
          background: { r: 255, g: 49, b: 49, alpha: 0.7 },
        },
      })
        .png()
        .toBuffer();

      await writeFile(inputPath, input);

      const result = await ReceiptLogoService.process(inputPath);
      const { data: pixels, info: pixelInfo } = await sharp(result.data)
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      let isGrayscale = true;

      for (let index = 0; index < pixels.length; index += pixelInfo.channels) {
        if (
          pixels[index] !== pixels[index + 1] ||
          pixels[index] !== pixels[index + 2]
        ) {
          isGrayscale = false;
          break;
        }
      }

      assert.equal(result.mimeType, "image/png");
      assert.isAtMost(result.width, 400);
      assert.isAtMost(result.height, 200);
      assert.isAtMost(result.sizeBytes, 150 * 1024);
      assert.lengthOf(result.checksum, 64);
      assert.isTrue(isGrayscale);
    } finally {
      await unlink(inputPath).catch(() => undefined);
    }
  });

  test("generates receipts with and without a processed logo", async ({
    assert,
  }) => {
    const logo = await sharp({
      create: {
        width: 300,
        height: 120,
        channels: 3,
        background: { r: 30, g: 30, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const order = {
      companyId: 11,
      companyOrderNumber: 123,
      company: {
        name: "Restaurante de prueba",
        taxId: "123",
      },
      createdAt: DateTime.fromISO("2026-07-27T20:00:00-05:00"),
      tableId: null,
      orderItems: [
        {
          quantity: 1,
          totalPrice: 10_000,
          product: { name: "Producto" },
        },
      ],
      adjustments: [],
      payments: [
        {
          amount: 10_000,
          paymentMethod: { name: "Efectivo" },
        },
      ],
    } as unknown as Order;

    const withoutLogo = await ReceiptPdfService.generate(order);
    const withLogo = await ReceiptPdfService.generate(order, logo);

    assert.equal(withoutLogo.subarray(0, 5).toString(), "%PDF-");
    assert.equal(withLogo.subarray(0, 5).toString(), "%PDF-");
    assert.isAbove(withoutLogo.length, 1_000);
    assert.isAbove(withLogo.length, 1_000);
    assert.notDeepEqual(withLogo, withoutLogo);
  });
});
