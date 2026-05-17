//import db from "@adonisjs/lucid/services/db";

import Order from "#models/order";
import OrderAdjustment from "#models/order_adjustment";

interface AdjustmentPayload {
  type: "charge" | "discount";
  description: string;
  amount: number;
}

export default class OrderAdjustmentService {
  /**
   * Guarda adjustments y recalcula total real
   */
  static async applyAdjustments(
    order: Order,
    adjustments: AdjustmentPayload[],
    trx?: any,
  ) {
    // Eliminar ajustes anteriores
    await OrderAdjustment.query({ client: trx })
      .where("order_id", order.id)
      .delete();

    // Guardar nuevos ajustes
    for (const adjustment of adjustments) {
      await OrderAdjustment.create(
        {
          orderId: order.id,
          type: adjustment.type,
          description: adjustment.description,
          amount: adjustment.amount,
        },
        {
          client: trx,
        },
      );
    }

    // Recargar ajustes
    await order.load("adjustments");

    // Calcular cargos
    const totalCharges = order.adjustments
      .filter((item) => item.type === "charge")
      .reduce((sum, item) => sum + Number(item.amount), 0);

    // Calcular descuentos
    const totalDiscounts = order.adjustments
      .filter((item) => item.type === "discount")
      .reduce((sum, item) => sum + Number(item.amount), 0);

    // Subtotal original productos
    const subtotal = Number(order.subtotal || 0);

    // Total final real
    const totalAmount = subtotal + totalCharges - totalDiscounts;

    // Actualizar orden
    order.totalAmount = totalAmount;

    await order.useTransaction(trx).save();

    return {
      subtotal,
      totalCharges,
      totalDiscounts,
      totalAmount,
    };
  }
}
