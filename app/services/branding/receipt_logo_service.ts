import { createHash } from "node:crypto";
import sharp from "sharp";

const RECEIPT_LOGO_MAX_WIDTH = 400;
const RECEIPT_LOGO_MAX_HEIGHT = 200;
const RECEIPT_LOGO_MAX_BYTES = 150 * 1024;
const RECEIPT_LOGO_MAX_INPUT_PIXELS = 16_000_000;

export interface ProcessedReceiptLogo {
  data: Buffer;
  mimeType: "image/png";
  sizeBytes: number;
  width: number;
  height: number;
  checksum: string;
}

export default class ReceiptLogoService {
  public static async process(inputPath: string): Promise<ProcessedReceiptLogo> {
    const { data, info } = await sharp(inputPath, {
      failOn: "error",
      limitInputPixels: RECEIPT_LOGO_MAX_INPUT_PIXELS,
    })
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize({
        width: RECEIPT_LOGO_MAX_WIDTH,
        height: RECEIPT_LOGO_MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .grayscale()
      .normalise()
      .png({
        palette: true,
        colours: 16,
        dither: 0.8,
        compressionLevel: 9,
      })
      .toBuffer({ resolveWithObject: true });

    if (data.byteLength > RECEIPT_LOGO_MAX_BYTES) {
      throw new RangeError(
        "El logo procesado supera el limite permitido de 150 KB.",
      );
    }

    return {
      data,
      mimeType: "image/png",
      sizeBytes: data.byteLength,
      width: info.width,
      height: info.height,
      checksum: createHash("sha256").update(data).digest("hex"),
    };
  }
}
