import Order from '#models/order'
import OrderItem from '#models/order_item'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DateTime } from 'luxon'
import { isKitchenOrderClosed, KitchenOperationError } from '#services/kitchen_state'

export interface KitchenContext { companyId: number; locationId: number }

export default class KitchenService {
  private static async lockOrder(context: KitchenContext, orderId: number, trx: TransactionClientContract) {
    const order = await Order.query({ client: trx })
      .where('company_id', context.companyId).where('location_id', context.locationId)
      .where('id', orderId).forUpdate().first()
    if (!order) throw new KitchenOperationError('ORDER_NOT_FOUND', 'La comanda no está disponible.', 404)
    if (isKitchenOrderClosed(order)) {
      throw new KitchenOperationError('KITCHEN_ORDER_CLOSED', 'Esta comanda ya terminó y no puede volver a cocina.')
    }
    return order
  }

  static async changeItem(context: KitchenContext, orderId: number, itemId: number, isReady: boolean) {
    return db.transaction(async (trx) => {
      const order = await this.lockOrder(context, orderId, trx)
      if (order.isReadyToServe) {
        throw new KitchenOperationError('KITCHEN_ALREADY_DISPATCHED', 'Esta comanda ya salió de cocina.')
      }
      const item = await OrderItem.query({ client: trx })
        .where('order_id', order.id).where('id', itemId).forUpdate().first()
      if (!item) throw new KitchenOperationError('ITEM_NOT_FOUND', 'El producto no pertenece a esta comanda.', 404)
      if (item.kitchenStatus === 'served' || item.servedAt) {
        throw new KitchenOperationError('KITCHEN_ITEM_SERVED', 'Este producto ya fue entregado y no se puede cambiar.')
      }
      if (item.kitchenStatus === 'ready') {
        throw new KitchenOperationError('KITCHEN_ITEM_DISPATCHED', 'Este producto ya salió de cocina y no se puede cambiar.')
      }
      // A checked item awaits dispatch (pending). Only dispatch makes it ready/locked.
      const nextStatus = isReady ? 'pending' : 'in_preparation'
      const previousStatus = item.kitchenStatus
      if (previousStatus !== nextStatus) {
        item.useTransaction(trx)
        item.kitchenStatus = nextStatus
        item.kitchenReadyAt = isReady ? DateTime.now() : null
        await item.save()
      }
      return { orderId: order.id, itemId: item.id, previousStatus, kitchenStatus: item.kitchenStatus, newStatus: isReady }
    })
  }

  static async dispatch(context: KitchenContext, orderId: number) {
    return db.transaction(async (trx) => {
      const order = await this.lockOrder(context, orderId, trx)
      if (order.isReadyToServe) {
        throw new KitchenOperationError('KITCHEN_ALREADY_DISPATCHED', 'Esta comanda ya salió de cocina.')
      }
      await order.load('orderItems', (query) => query.forUpdate())
      // Keep previously dispatched/served items intact; only new pending items leave this batch.
      if (!order.orderItems.some((item) => item.kitchenStatus === 'pending') ||
        order.orderItems.some((item) => !['pending', 'ready', 'served'].includes(item.kitchenStatus))) {
        throw new KitchenOperationError('KITCHEN_NOT_READY', 'Marca los productos preparados antes de despachar la comanda.')
      }
      for (const item of order.orderItems) {
        if (item.kitchenStatus === 'pending') {
          item.useTransaction(trx)
          item.kitchenStatus = 'ready'
          item.kitchenReadyAt ||= DateTime.now()
          await item.save()
        }
      }
      order.useTransaction(trx)
      order.isReadyToServe = true
      await order.save()
      return order.id
    })
  }

  static async serve(context: KitchenContext, orderId: number) {
    return db.transaction(async (trx) => {
      const order = await this.lockOrder(context, orderId, trx)
      await order.load('orderItems', (query) => query.forUpdate())
      if (!order.isReadyToServe || !order.orderItems.some((item) => item.kitchenStatus === 'ready') ||
        order.orderItems.some((item) => !['ready', 'served'].includes(item.kitchenStatus))) {
        throw new KitchenOperationError('KITCHEN_NOT_DISPATCHED', 'Esta comanda todavía no está lista para entregar.')
      }
      const now = DateTime.now()
      for (const item of order.orderItems) {
        if (item.kitchenStatus === 'ready') {
          item.useTransaction(trx)
          item.kitchenStatus = 'served'
          item.servedAt = now
          await item.save()
        }
      }
      order.useTransaction(trx)
      order.servedAt = now
      order.isServed = true
      await order.save()
      return order.id
    })
  }
}
