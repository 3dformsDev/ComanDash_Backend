import OrderItemModifierSelection from '#models/order_item_modifier_selection'
import ProductModifierGroup from '#models/product_modifier_group'
import { Decimal } from 'decimal.js'

export interface ModifierSelectionInput {
  modifierGroupId: number
  modifierOptionId: number
  quantity: number
}

interface ValidatedModifierSelection extends ModifierSelectionInput {
  groupName: string
  optionName: string
  unitPriceAdjustment: number
  displayOrder: number
}

export interface OrderItemInput {
  orderItemId?: number
  productId: number
  quantity: number
  modifierSelections?: ModifierSelectionInput[]
}

export class OrderItemPersonalizationError extends Error {
  readonly status = 422
  readonly code = 'ORDER_ITEM_PERSONALIZATION_INVALID'
  readonly messages: Array<{ message: string }>

  constructor(message: string) {
    super(message)
    this.name = 'OrderItemPersonalizationError'
    this.messages = [{ message }]
  }
}

export default class OrderItemPersonalizationService {
  async validate(
    companyId: number,
    item: OrderItemInput,
    trx: any,
    allowLegacyEmpty = false,
  ): Promise<ValidatedModifierSelection[]> {
    const assignments = await ProductModifierGroup.query({ client: trx })
      .where('company_id', companyId)
      .where('product_id', item.productId)
      .orderBy('display_order', 'asc')
      .preload('optionSettings', (optionPriceQuery) => {
        optionPriceQuery.where('company_id', companyId)
      })
      .preload('modifierGroup', (groupQuery) => {
        groupQuery
          .where('company_id', companyId)
          .where('is_active', true)
          .preload('options', (optionQuery) => {
            optionQuery
              .where('company_id', companyId)
              .where('is_active', true)
              .orderBy('display_order', 'asc')
          })
      })

    const activeAssignments = assignments.filter(
      (assignment) => assignment.modifierGroup && assignment.modifierGroup.isActive,
    )
    const requested = item.modifierSelections || []

    if (activeAssignments.length === 0) {
      if (requested.length > 0) {
        throw new OrderItemPersonalizationError('El producto no tiene grupos de opciones activos.')
      }
      return []
    }

    if (requested.length === 0 && allowLegacyEmpty) {
      return []
    }

    const assignmentMap = new Map(
      activeAssignments.map((assignment) => [assignment.modifierGroupId, assignment]),
    )
    const requestedByGroup = new Map<number, ModifierSelectionInput[]>()

    for (const selection of requested) {
      const quantity = Number(selection.quantity || 0)
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new OrderItemPersonalizationError('La cantidad seleccionada para una opcion no es valida.')
      }

      const assignment = assignmentMap.get(selection.modifierGroupId)
      if (!assignment) {
        throw new OrderItemPersonalizationError('Una opcion seleccionada no pertenece a este producto.')
      }

      const option = assignment.modifierGroup.options.find(
        (candidate) => candidate.id === selection.modifierOptionId,
      )
      if (!option) {
        throw new OrderItemPersonalizationError(
          `Una opcion del grupo "${assignment.modifierGroup.name}" no esta disponible.`,
        )
      }

      const groupSelections = requestedByGroup.get(selection.modifierGroupId) || []
      groupSelections.push({ ...selection, quantity })
      requestedByGroup.set(selection.modifierGroupId, groupSelections)
    }

    const validated: ValidatedModifierSelection[] = []
    for (const assignment of activeAssignments) {
      const groupSelections = requestedByGroup.get(assignment.modifierGroupId) || []
      const totalSelected = groupSelections.reduce(
        (total, selection) => total + selection.quantity,
        0,
      )

      if (totalSelected < assignment.minSelections || totalSelected > assignment.maxSelections) {
        const expected = assignment.minSelections > 0
          ? `debe tener exactamente ${assignment.maxSelections}`
          : `permite hasta ${assignment.maxSelections}`
        throw new OrderItemPersonalizationError(
          `El grupo "${assignment.modifierGroup.name}" ${expected} elecciones.`,
        )
      }

      const optionIds = groupSelections.map((selection) => selection.modifierOptionId)
      if (!assignment.allowOptionQuantities) {
        if (groupSelections.some((selection) => selection.quantity !== 1)) {
          throw new OrderItemPersonalizationError(
            `El grupo "${assignment.modifierGroup.name}" no permite repetir opciones.`,
          )
        }
        if (new Set(optionIds).size !== optionIds.length) {
          throw new OrderItemPersonalizationError(
            `El grupo "${assignment.modifierGroup.name}" no permite repetir opciones.`,
          )
        }
      }

      groupSelections.forEach((selection, index) => {
        const option = assignment.modifierGroup.options.find(
          (candidate) => candidate.id === selection.modifierOptionId,
        )!
        validated.push({
          ...selection,
          groupName: assignment.modifierGroup.name,
          optionName: option.name,
          unitPriceAdjustment: Number(
            assignment.optionSettings.find(
              (setting) => setting.modifierOptionId === option.id,
            )?.priceAdjustment || 0,
          ),
          displayOrder: assignment.displayOrder * 1000 + index,
        })
      })
    }

    return validated
  }

  async persist(
    orderItemId: number,
    companyId: number,
    selections: ValidatedModifierSelection[],
    itemQuantity: number,
    trx: any,
  ): Promise<void> {
    if (selections.length === 0) return

    await OrderItemModifierSelection.createMany(
      selections.map((selection) => ({
        companyId,
        orderItemId,
        modifierGroupId: selection.modifierGroupId,
        modifierOptionId: selection.modifierOptionId,
        groupNameSnapshot: selection.groupName,
        optionNameSnapshot: selection.optionName,
        quantity: selection.quantity,
        unitPriceAdjustment: selection.unitPriceAdjustment,
        totalPriceAdjustment: new Decimal(selection.unitPriceAdjustment)
          .times(selection.quantity)
          .times(itemQuantity)
          .toNumber(),
        displayOrder: selection.displayOrder,
      })),
      { client: trx },
    )
  }

  async clonePersistedSelections(
    orderItemId: number,
    companyId: number,
    selections: OrderItemModifierSelection[],
    itemQuantity: number,
    trx: any,
  ): Promise<void> {
    if (selections.length === 0) return

    await OrderItemModifierSelection.createMany(
      selections.map((selection) => ({
        companyId,
        orderItemId,
        modifierGroupId: selection.modifierGroupId,
        modifierOptionId: selection.modifierOptionId,
        groupNameSnapshot: selection.groupNameSnapshot,
        optionNameSnapshot: selection.optionNameSnapshot,
        quantity: selection.quantity,
        unitPriceAdjustment: selection.unitPriceAdjustment,
        totalPriceAdjustment: new Decimal(selection.unitPriceAdjustment || 0)
          .times(selection.quantity)
          .times(itemQuantity)
          .toNumber(),
        displayOrder: selection.displayOrder,
      })),
      { client: trx },
    )
  }

  calculateSelectionsUnitTotal(selections: ValidatedModifierSelection[]): Decimal {
    return selections.reduce(
      (total, selection) =>
        total.plus(new Decimal(selection.unitPriceAdjustment).times(selection.quantity)),
      new Decimal(0),
    )
  }

  calculatePersistedSelectionsUnitTotal(
    selections: OrderItemModifierSelection[],
  ): Decimal {
    return selections.reduce(
      (total, selection) =>
        total.plus(
          new Decimal(selection.unitPriceAdjustment || 0).times(selection.quantity),
        ),
      new Decimal(0),
    )
  }

  calculateLineTotal(
    productUnitPrice: Decimal.Value,
    itemQuantity: number,
    selections: ValidatedModifierSelection[],
  ): Decimal {
    return new Decimal(productUnitPrice)
      .plus(this.calculateSelectionsUnitTotal(selections))
      .times(itemQuantity)
  }

  calculatePersistedLineTotal(
    productUnitPrice: Decimal.Value,
    itemQuantity: number,
    selections: OrderItemModifierSelection[],
  ): Decimal {
    return new Decimal(productUnitPrice)
      .plus(this.calculatePersistedSelectionsUnitTotal(selections))
      .times(itemQuantity)
  }
}
