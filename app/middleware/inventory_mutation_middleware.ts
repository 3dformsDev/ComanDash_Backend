import type { HttpContext } from '@adonisjs/core/http'
import type { NextFn } from '@adonisjs/core/types/http'
import InventoryMutationService from '#services/inventory/inventory_mutation_service'
import { InventoryError } from '#services/inventory/inventory_math'

export default class InventoryMutationMiddleware {
  async handle(ctx: HttpContext, next: NextFn) {
    try {
      const result = await InventoryMutationService.replay(ctx)
      if (result) return ctx.response.ok(result)
      await next()
      // A notification failure after commit must never invite a second sale.
      if (ctx.response.getStatus() >= 400) {
        const committed = await InventoryMutationService.replay(ctx)
        if (committed) return ctx.response.ok(committed)
      }
    } catch (error) {
      if (error instanceof InventoryError) return ctx.response.status(error.status).send({ message: error.message, code: error.code })
      throw error
    }
  }
}
