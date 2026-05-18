import PDFDocument from "pdfkit";
import Order from "#models/order";
import OrderAdjustment from "#models/order_adjustment";

export default class ReceiptPdfService {
  public static async generate(order: Order) {
    const doc = new PDFDocument({
      size: [226, 800],
      margins: {
        top: 20,
        bottom: 20,
        left: 15,
        right: 15,
      },
    });

    const buffers: Buffer[] = [];

    doc.on("data", buffers.push.bind(buffers));

    return new Promise<Buffer>((resolve, reject) => {
      doc.on("end", () => {
        resolve(Buffer.concat(buffers));
      });

      doc.on("error", reject);

      /* ===================================================== */
      /* HEADER */
      /* ===================================================== */

      const company: any = order.company;

      doc
        .fontSize(22)
        .font("Helvetica-Bold")
        .text(company.name || "COMANDASH", {
          align: "center",
        });

      doc.moveDown(0.4);

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`NIT: ${company.taxId || "N/A"}`, {
          align: "center",
        });

      if (company.address) {
        doc.text(company.address, {
          align: "center",
        });
      }

      if (company.city || company.state) {
        doc.text(
          `${company.city || ""}${company.city && company.state ? ", " : ""}${company.state || ""}`,
          {
            align: "center",
          },
        );
      }

      if (company.phone) {
        doc.text(`Tel: ${company.phone}`, {
          align: "center",
        });
      }

      doc.moveDown();

      /* ===================================================== */
      /* ORDER INFO */
      /* ===================================================== */

      doc.fontSize(10).font("Helvetica").text(`Orden #${order.id}`, {
        align: "center",
      });

      doc.text(
        `Fecha: ${order.createdAt
          .setZone("America/Bogota")
          .toFormat("dd/MM/yyyy HH:mm")}`,
        {
          align: "center",
        },
      );

      if (order.tableId) {
        doc.text(`Mesa: ${order.tableId}`, {
          align: "center",
        });
      }

      doc.moveDown();

      /* ===================================================== */
      /* DIVIDER */
      /* ===================================================== */

      doc.moveTo(15, doc.y).lineTo(195, doc.y).stroke();

      doc.moveDown();

      /* ===================================================== */
      /* PRODUCTS */
      /* ===================================================== */

      let subtotal = 0;

      for (const item of order.orderItems) {
        const itemTotal = Number(item.totalPrice);

        subtotal += itemTotal;

        const productName = `${item.quantity}x ${item.product?.name || "Producto"}`;

        const currentY = doc.y;

        doc.fontSize(10).font("Helvetica").text(productName, 15, currentY, {
          width: 115,
          align: "left",
        });

        doc
          .font("Helvetica-Bold")
          .text(`$${itemTotal.toLocaleString("es-CO")}`, 140, currentY, {
            width: 55,
            align: "right",
          });

        doc.moveDown(0.7);
      }

      doc.moveDown(0.5);

      /* ===================================================== */
      /* ADJUSTMENTS */
      /* ===================================================== */

      const adjustments = (order as any).adjustments || [];

      const charges = adjustments.filter(
        (adj: OrderAdjustment) => adj.type === "charge",
      );

      const discounts = adjustments.filter(
        (adj: OrderAdjustment) => adj.type === "discount",
      );

      let totalCharges = 0;
      let totalDiscounts = 0;

      for (const charge of charges) {
        totalCharges += Number(charge.amount);

        const currentY = doc.y;

        doc
          .fontSize(10)
          .font("Helvetica")
          .text(`+ ${charge.description}`, 15, currentY, {
            width: 115,
            align: "left",
          });

        doc
          .font("Helvetica")
          .fillColor("black")
          .text(
            `+$${Number(charge.amount).toLocaleString("es-CO")}`,
            140,
            currentY,
            {
              width: 55,
              align: "right",
            },
          );

        doc.fillColor("black");

        doc.moveDown(0.7);
      }

      for (const discount of discounts) {
        totalDiscounts += Number(discount.amount);

        const currentY = doc.y;

        doc
          .fontSize(10)
          .font("Helvetica")
          .text(`- ${discount.description}`, 15, currentY, {
            width: 115,
            align: "left",
          });

        doc
          .font("Helvetica")
          .fillColor("black")
          .text(
            `-$${Number(discount.amount).toLocaleString("es-CO")}`,
            140,
            currentY,
            {
              width: 55,
              align: "right",
            },
          );

        doc.fillColor("black");

        doc.moveDown(0.7);
      }

      doc.moveDown(0.5);

      const total = subtotal + totalCharges - totalDiscounts;

      /* ===================================================== */
      /* TOTAL */
      /* ===================================================== */

      doc.moveTo(15, doc.y).lineTo(195, doc.y).stroke();

      doc.moveDown();

      //const total = subtotal;

      doc
        .fontSize(16)
        .font("Helvetica-Bold")
        .text("TOTAL", 15, doc.y, {
          continued: true,
        })
        .text(`$${total.toLocaleString("es-CO")}`, {
          align: "right",
        });

      doc.moveDown(1);

      /* ===================================================== */
      /* PAYMENT METHOD */
      /* ===================================================== */

      let paymentMethodName = "Pago registrado";

      if (order.payments?.length) {
        const payment = order.payments[0] as any;

        if (payment?.paymentMethod?.name) {
          paymentMethodName = payment.paymentMethod.name;
        }
      }

      doc
        .fontSize(10)
        .font("Helvetica")
        .text(`Método de pago: ${paymentMethodName}`, {
          align: "center",
        });

      doc.moveDown(1);

      /* ===================================================== */
      /* FOOTER */
      /* ===================================================== */

      doc.fontSize(10).font("Helvetica").text("Gracias por tu compra", {
        align: "center",
      });

      doc.moveDown(0.2);

      doc.text("Vuelve pronto :)", {
        align: "center",
      });

      doc.moveDown();

      doc.fontSize(8).text("Generado por COMANDASH", {
        align: "center",
      });

      doc.end();
    });
  }
}
