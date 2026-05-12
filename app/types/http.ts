// types/http.ts
import type User from '#models/user'

declare module '@adonisjs/core/http' {
  interface HttpContext {
    companyId: number
    locationId?: number
    authGuard: string
    currentUser: User
    cashRegisterSessionId?: number
    getRequestData(): Record<string, any>
    getQueryData(): Record<string, any>
    checkPermission(functionalityCode: string, action?: 'can_access' | 'can_create' | 'can_read' | 'can_update' | 'can_delete'): Promise<boolean>
    getUserPermissions(): Promise<any>
  }
}