import type { HttpContext } from '@adonisjs/core/http'

import Order from '#models/order'
import ReceiptPdfService from '#services/pdf/receipt_pdf_service'

export default class ReceiptsController {

  public async download({ params, response }: HttpContext) {

    const order = await Order.query()
      .where('id', params.orderId)
      .preload('orderItems', (query) => {
        query.preload('product')
      })
      .preload('payments')
      .firstOrFail()

    const pdfBuffer = await ReceiptPdfService.generate(order)

    response.header('Content-Type', 'application/pdf')

    response.header(
      'Content-Disposition',
      `attachment; filename=receipt-${order.id}.pdf`
    )

    return response.send(pdfBuffer)

  }

}
