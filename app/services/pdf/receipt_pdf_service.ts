import PDFDocument from 'pdfkit'
import Order from '#models/order'

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
    })

    const buffers: Buffer[] = []

    doc.on('data', buffers.push.bind(buffers))

    return new Promise<Buffer>((resolve, reject) => {

      doc.on('end', () => {
        resolve(Buffer.concat(buffers))
      })

      doc.on('error', reject)

      /* ===================================================== */
      /* HEADER */
      /* ===================================================== */

      doc
        .fontSize(18)
        .text('COMANDASH DEMO', {
          align: 'center',
        })

      doc.moveDown(0.3)

      doc
        .fontSize(10)
        .text('NIT: 900.000.000-0', {
          align: 'center',
        })

      doc.text('Bogotá, Colombia', {
        align: 'center',
      })

      doc.moveDown()

      /* ===================================================== */
      /* ORDER INFO */
      /* ===================================================== */

      doc
        .fontSize(11)
        .text(`Orden #${order.id}`)

      doc.text(`Fecha: ${order.createdAt.toFormat('dd/MM/yyyy HH:mm')}`)

      if (order.tableId) {
        doc.text(`Mesa: ${order.tableId}`)
      }

      doc.moveDown()

      /* ===================================================== */
      /* DIVIDER */
      /* ===================================================== */

      doc
        .moveTo(15, doc.y)
        .lineTo(210, doc.y)
        .stroke()

      doc.moveDown()

      /* ===================================================== */
      /* PRODUCTS */
      /* ===================================================== */

      let subtotal = 0

      for (const item of order.orderItems) {

        const itemTotal = Number(item.totalPrice)

        subtotal += itemTotal

        doc
          .fontSize(10)
          .text(
            `${item.quantity}x ${item.product?.name || 'Producto'}`,
            {
              continued: true,
              width: 140,
            }
          )
          .text(
            `$${itemTotal.toLocaleString('es-CO')}`,
            {
              align: 'right',
            }
          )

      }

      doc.moveDown()

      /* ===================================================== */
      /* TOTAL */
      /* ===================================================== */

      doc
        .moveTo(15, doc.y)
        .lineTo(210, doc.y)
        .stroke()

      doc.moveDown()

      doc
        .fontSize(14)
        .text(
          'TOTAL',
          {
            continued: true,
          }
        )
        .text(
          `$${subtotal.toLocaleString('es-CO')}`,
          {
            align: 'right',
          }
        )

      doc.moveDown()

      /* ===================================================== */
      /* PAYMENT METHOD */
      /* ===================================================== */

      if (order.payments?.length) {

          const payment = order.payments[0]

        doc
          .fontSize(10)
          .text(`Método de pago: ${'Pago registrado'}`)

      }

      doc.moveDown()

      /* ===================================================== */
      /* FOOTER */
      /* ===================================================== */

      doc
        .fontSize(10)
        .text('Gracias por tu compra', {
          align: 'center',
        })

      doc.text('Vuelve pronto :)', {
        align: 'center',
      })

      doc.end()

    })

  }

}
