import { Decimal } from 'decimal.js'

export class InventoryError extends Error {
  constructor(message: string, public code = 'INVENTORY_INVALID', public status = 422) { super(message) }
}
export const MAX_UNITS = 1_000_000_000
export function units(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > MAX_UNITS) {
    throw new InventoryError('Ingresa una cantidad válida de unidades completas.')
  }
  return value
}
export function money(value: unknown): Decimal {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    throw new InventoryError('Ingresa el costo. Puede ser cero.')
  }
  let result: Decimal
  try { result = new Decimal(String(value)) } catch { throw new InventoryError('Ingresa un costo válido.') }
  if (!result.isFinite() || result.isNegative() || result.greaterThan('9999999999.99')) {
    throw new InventoryError('Ingresa un costo válido, igual o mayor que cero.')
  }
  return result.toDecimalPlaces(6)
}
export function valuation(quantity: number, carryingValue: string, delta: number, incomingCost?: string, incomingValue?: string) {
  units(quantity); units(Math.abs(delta))
  const next = quantity + delta
  if (!Number.isSafeInteger(next) || next < 0 || next > MAX_UNITS) {
    throw new InventoryError(`Solo quedan ${quantity} unidades disponibles.`, 'INVENTORY_INSUFFICIENT', 409)
  }
  const value = new Decimal(carryingValue)
  const cost = delta > 0 ? money(incomingCost) : quantity ? value.div(quantity) : new Decimal(0)
  const change = delta > 0 && incomingValue !== undefined ? new Decimal(incomingValue).toDecimalPlaces(6)
    : delta === -quantity ? value.negated() : cost.mul(delta).toDecimalPlaces(6)
  if (!change.isFinite() || (delta > 0 && change.isNegative())) throw new InventoryError('El valor de la operación no es válido.')
  const nextValue = next === 0 ? new Decimal(0) : value.plus(change).toDecimalPlaces(6)
  if (nextValue.isNegative() || nextValue.greaterThanOrEqualTo('100000000000000')) {
    throw new InventoryError('El valor de esta operación supera el límite permitido.')
  }
  return { quantity: next, value: nextValue.toFixed(6), delta: change.toFixed(6), unitCost: cost.toFixed(6) }
}
export interface Component { productId: number; name: string; units: number; origin: string }
export function demand(components: Component[], count: number): Map<number, number> {
  units(count)
  const result = new Map<number, number>()
  for (const component of components) {
    units(component.units, 1)
    const value = (result.get(component.productId) || 0) + component.units * count
    units(value)
    result.set(component.productId, value)
  }
  return result
}
export function returnQuantity(removed: number, recovered: unknown, reason?: string) {
  units(removed, 1)
  const result = units(recovered)
  if (result > removed) throw new InventoryError('No puedes devolver más unidades de las retiradas.')
  if (result < removed && !reason?.trim()) throw new InventoryError('Indica por qué algunas unidades no regresan.')
  return { recovered: result, notRecovered: removed - result }
}
export function returnValue(quantity: number, value: string, resolvedQuantity: number, resolvedValue: string, removed: number, recovered: number) {
  const total = new Decimal(value)
  // Round the cumulative allocation, not each slice: tiny values must never
  // be over-allocated by many partial returns.
  const removedValue = total.mul(resolvedQuantity + removed).div(quantity).toDecimalPlaces(6).minus(resolvedValue)
  return { resolvedValue: new Decimal(resolvedValue).plus(removedValue).toFixed(6),
    recoveredValue: removedValue.mul(recovered).div(removed).toFixed(6) }
}
export function json<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  return (typeof value === 'string' ? JSON.parse(value) : value) as T
}
export function reductions(sources: any[], desired: Map<string, Map<number, number>>) {
  const totals = new Map<string, number>()
  for (const s of sources) {
    const key = `${s.line_key}:${s.product_id}`
    totals.set(key, (totals.get(key) || 0) + Number(s.quantity) - Number(s.resolved_quantity))
  }
  const result: Array<{ source: any; quantity: number }> = []
  for (const s of sources) {
    const key = `${s.line_key}:${s.product_id}`
    const target = desired.get(s.line_key)?.get(Number(s.product_id)) || 0
    const excess = Math.max(0, (totals.get(key) || 0) - target)
    const removed = Math.min(excess, Number(s.quantity) - Number(s.resolved_quantity))
    if (removed > 0) { result.push({ source: s, quantity: removed }); totals.set(key, (totals.get(key) || 0) - removed) }
  }
  return result
}
