import type { HttpContext } from "@adonisjs/core/http";

import Order from "#models/order";
import CompanyReceiptBranding from "#models/company_receipt_branding";
import ReceiptPdfService from "#services/pdf/receipt_pdf_service";

export default class ReceiptsController {
  public async download({
    params,
    response,
    companyId,
    locationId,
  }: HttpContext) {
    if (!companyId || !locationId) {
      return response.badRequest({
        message: "La compania y la sucursal son requeridas.",
      });
    }

    const order = await Order.query()
      .where("id", params.orderId)
      .where("company_id", companyId)
      .where("location_id", locationId)
      .preload("orderItems", (query) => {
        query.preload("product");
      })
      .preload("payments", (query) => {
        query.preload("paymentMethod");
      })
      .preload("adjustments")
      .preload("company")
      .firstOrFail();

    let logoBuffer: Buffer | undefined;

    try {
      const branding = await CompanyReceiptBranding.find(companyId);
      logoBuffer = branding?.logoData;
    } catch (error) {
      console.warn(
        "No se pudo cargar el logo del recibo. Se generara sin logo:",
        error,
      );
    }

    const pdfBuffer = await ReceiptPdfService.generate(
      order,
      logoBuffer,
    );

    response.header("Content-Type", "application/pdf");

    response.header(
      "Content-Disposition",
      `attachment; filename=recibo-${order.id}.pdf`,
    );

    return response.send(pdfBuffer);
  }
}
