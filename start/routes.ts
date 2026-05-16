/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import AuthController from '#controllers/auth_controller';
import CompaniesController from '#controllers/companies_controller';
import LocationsController from '#controllers/locations_controller';
import router from '@adonisjs/core/services/router'
import { middleware } from './kernel.js';
import RolesController from '#controllers/roles_controller';
import PaymentMethodsController from '#controllers/payment_methods_controller';
import CategoriesController from '#controllers/categories_controller';
import ProductsController from '#controllers/products_controller';
import TablesController from '#controllers/tables_controller';
import CashRegistersController from '#controllers/cash_registers_controller';
import OrdersController from '#controllers/orders_controller';
import CashRegisterSessionsController from '#controllers/cash_register_sessions_controller';
import CashMovementsController from '#controllers/cash_movements_controller';
import OrderPaymentsController from '#controllers/order_payments_controller';
import NotificationsController from '#controllers/notifications_controller';
import ReportsController from '#controllers/reports_controller';
import ReceiptsController from '#controllers/receipts_controller';

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

router.group(() => {

  router.post('/regisercompany', [CompaniesController, 'registerNewCompany'])

  // Rutas públicas de autenticación
  router.group(() => {
    router.post('/login', [AuthController, 'login'])
    router.post('/register', [AuthController, 'register'])
  }).prefix('/auth')

  // Rutas protegidas de autenticación
  router.group(() => {
    router.get('/me', [AuthController, 'me'])
    router.post('/refresh', [AuthController, 'refresh'])
  }).prefix('/auth').use(middleware.auth())

  router.post('/auth/logout', [AuthController, 'logout'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
    ])

  // Rutas de gestión de roles (requieren permisos específicos)
  router.group(() => {
    router.get('/functionalities', [RolesController, 'functionalities'])

    router.resource('roles', RolesController).only(['index', 'show', 'store', 'update', 'destroy'])

    // Rutas adicionales para roles
    router.post('/roles/:id/permissions', [RolesController, 'assignPermissions'])
    router.post('/roles/:id/clone', [RolesController, 'clone'])
    router.patch('/roles/:id/toggle-status', [RolesController, 'toggleStatus'])
  })
    .prefix('/admin')
    .use(middleware.auth())
    .use(middleware.permission({ functionality: 'roles.manage' }))

  // Rutas protegidas que requieren autenticación
  // router.ts

  router.resource('companies', CompaniesController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])
    .middleware('index', [middleware.permission({
      functionality: 'roles.manage',
      action: 'can_read'
    })])
    .middleware('store', [middleware.permission({
      functionality: 'roles.manage',
      action: 'can_create'
    })])
    .middleware('update', [middleware.permission({
      functionality: 'roles.manage',
      action: 'can_update'
    })])
    .middleware('destroy', [middleware.permission({
      functionality: 'roles.manage',
      action: 'can_delete'
    })])

  router.post('orders/cancel/:id', [OrdersController, 'cancelOrder'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen(),
    ])

  router.get('orders/kitchen/pending', [OrdersController, 'getPendingFotKitchen'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen()
    ])

  router.put('orders/kitchen/markasready/:id', [OrdersController, 'markAsReady'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen()
    ])

  router.put('orders/waiter/markasserved/:id', [OrdersController, 'markAsServed'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen()
    ])

  router.get('orders/waiter/active', [OrdersController, 'getActiveForWaiter'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen()
    ])

  router.resource('orders', OrdersController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])
    .middleware('store', [
      middleware.ensureCashRegisterIsOpen()
    ])
    .middleware('update', [
      middleware.ensureCashRegisterIsOpen()
    ])

  router.resource('orderpayments', OrderPaymentsController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])
    .middleware('store', [
      middleware.ensureCashRegisterIsOpen()
    ])
    .middleware('update', [
      middleware.ensureCashRegisterIsOpen()
    ])

    router.get(
      'receipts/:orderId/pdf',
      [ReceiptsController, 'download']
    )
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen(),
    ])


  router.resource('cashregisters', CashRegistersController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])

  router.get('cashregistersessions/summary/:id', [CashRegisterSessionsController, 'getSummary'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen(),
    ])
  router.get('cashregistersessions/dailysummary', [CashRegisterSessionsController, 'getDailyBusinessSummary'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen(),
    ])

  router.post('cashregistersessions/:id/close', [CashRegisterSessionsController, 'closeSession'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen(),
    ])

  router.resource('cashregistersessions', CashRegisterSessionsController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext()
    ])
    .middleware('update', [
      middleware.ensureCashRegisterIsOpen()
    ])

  router.resource('cashmovements', CashMovementsController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])
    .middleware('store', [
      middleware.ensureCashRegisterIsOpen()
    ])

  router.resource('locations', LocationsController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])

  router.resource('paymentmethods', PaymentMethodsController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])

  router.resource('categories', CategoriesController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])

  router
    .get('/products/:id/image', [ProductsController, 'serveImage'])
    .use(middleware.auth())
    .use(middleware.companyContext())

  router.post('/products/:id', [ProductsController, 'update']).middleware([
    middleware.auth(),
    middleware.companyContext()
  ])

  router.resource('products', ProductsController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])

  router.put('tables/release/:id/:orderId', [TablesController, 'releaseTable'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
      middleware.ensureCashRegisterIsOpen(),
    ])

  router.resource('tables', TablesController)
    .middleware('*', [
      middleware.auth(),
      middleware.companyContext(),
    ])

  router.post('/notifications/store-token', [NotificationsController, 'storeDeviceToken'])
    .middleware([
      middleware.auth(),
      middleware.companyContext(),
    ])

  //Reportes
  router.get('/reports/sales', [ReportsController, 'salesReport'])
    .middleware([
      middleware.auth(),
      middleware.companyContext()
    ])

  router.get('/reports/peak-times', [ReportsController, 'peakTimesReport'])
    .middleware([
      middleware.auth(),
      middleware.companyContext()
    ])

}).prefix('/api/v1/')
