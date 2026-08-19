import ActivityLog from '#models/activity_log'
import CashRegisterSession from '#models/cash_registers_session'
import {
  BUSINESS_TIME_ZONE,
  getBusinessDayCutoffHour,
  getCurrentBusinessDate,
} from '#services/reports/business_day_service'
import type { HttpContext } from '@adonisjs/core/http'
import { DateTime } from 'luxon'

export const CASH_REGISTER_PREVIOUS_BUSINESS_DAY =
  'CASH_REGISTER_PREVIOUS_BUSINESS_DAY'
export const CASH_RECOVERY_DURATION_MINUTES = 60

export interface CashRegisterOperatingState {
  status: 'no_open_session' | 'open_current' | 'open_previous'
  sessionId: number | null
  currentBusinessDate: string
  sessionBusinessDate: string | null
  businessDayCutoffHour: number
  openedAt: string | null
  isPreviousBusinessDay: boolean
  recoveryIsActive: boolean
  recoveryAuthorizedUntil: string | null
  recoveryAuthorizedBy: number | null
  recoveryReason: string | null
}

interface StateOptions {
  trx?: any
  lockForUpdate?: boolean
  now?: DateTime
}

interface RecoveryAuditContext {
  companyId: number
  userId: number
  cashRegisterSessionId?: number
  cashRegisterBusinessDate?: string
  cashRecoveryIsActive?: boolean
  cashRecoveryAuthorizedUntil?: string
  ipAddress?: string
  userAgent?: string
}

export default class CashRegisterOperatingService {
  async getState(
    companyId: number,
    locationId: number,
    options: StateOptions = {},
  ): Promise<CashRegisterOperatingState> {
    const now = (options.now || DateTime.now()).setZone(BUSINESS_TIME_ZONE)
    const query = CashRegisterSession.query(
      options.trx ? { client: options.trx } : undefined,
    )
      .where('company_id', companyId)
      .where('status', 'open')
      .whereHas('cashRegister', (cashRegisterQuery) => {
        cashRegisterQuery
          .where('company_id', companyId)
          .where('location_id', locationId)
      })
      .orderBy('opened_at', 'desc')

    if (options.lockForUpdate) {
      query.forUpdate()
    }

    const session = await query.first()
    const configuredCutoffHour = await getBusinessDayCutoffHour(
      companyId,
      locationId,
    )

    if (!session) {
      return {
        status: 'no_open_session',
        sessionId: null,
        currentBusinessDate: getCurrentBusinessDate(configuredCutoffHour, now),
        sessionBusinessDate: null,
        businessDayCutoffHour: configuredCutoffHour,
        openedAt: null,
        isPreviousBusinessDay: false,
        recoveryIsActive: false,
        recoveryAuthorizedUntil: null,
        recoveryAuthorizedBy: null,
        recoveryReason: null,
      }
    }

    const cutoffHour =
      session.businessDayCutoffHour ?? configuredCutoffHour
    const sessionBusinessDate =
      session.businessDate?.toISODate() ||
      getCurrentBusinessDate(cutoffHour, session.openedAt)
    const currentBusinessDate = getCurrentBusinessDate(cutoffHour, now)
    const isPreviousBusinessDay = sessionBusinessDate < currentBusinessDate
    const recoveryIsActive = Boolean(
      isPreviousBusinessDay &&
        session.recoveryAuthorizedUntil &&
        session.recoveryAuthorizedUntil.toMillis() > now.toUTC().toMillis(),
    )

    return {
      status: isPreviousBusinessDay ? 'open_previous' : 'open_current',
      sessionId: session.id,
      currentBusinessDate,
      sessionBusinessDate,
      businessDayCutoffHour: cutoffHour,
      openedAt: session.openedAt.toISO(),
      isPreviousBusinessDay,
      recoveryIsActive,
      recoveryAuthorizedUntil:
        session.recoveryAuthorizedUntil?.toISO() || null,
      recoveryAuthorizedBy: session.recoveryAuthorizedBy || null,
      recoveryReason: session.recoveryReason || null,
    }
  }

  applyStateToContext(
    ctx: HttpContext,
    state: CashRegisterOperatingState,
  ): void {
    ctx.cashRegisterSessionId = state.sessionId || undefined
    ctx.cashRegisterBusinessDate = state.sessionBusinessDate || undefined
    ctx.cashRegisterIsPreviousBusinessDay = state.isPreviousBusinessDay
    ctx.cashRecoveryIsActive = state.recoveryIsActive
    ctx.cashRecoveryAuthorizedUntil =
      state.recoveryAuthorizedUntil || undefined
  }

  async logRecoveryActivity(
    context: RecoveryAuditContext,
    action: string,
    resourceType: string,
    resourceId: number,
    details: Record<string, any>,
    trx?: any,
  ): Promise<void> {
    if (!context.cashRecoveryIsActive) {
      return
    }

    await ActivityLog.create(
      {
        companyId: context.companyId,
        userId: context.userId,
        action,
        resourceType,
        resourceId,
        details: {
          ...details,
          cashRegisterSessionId: context.cashRegisterSessionId,
          businessDate: context.cashRegisterBusinessDate,
          recoveryAuthorizedUntil: context.cashRecoveryAuthorizedUntil,
        },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
      trx ? { client: trx } : {},
    )
  }
}
