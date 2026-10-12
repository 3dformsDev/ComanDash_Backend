-- SOLO LECTURA. Eduard ejecuta cada SELECT por separado en DBeaver PRODUCTIVO.
-- Seleccionar la base correcta. Si DATABASE() es NULL, detenerse.
SELECT DATABASE() AS selected_database, VERSION() AS database_version,
       @@session.time_zone AS session_timezone, NOW() AS database_now,
       UTC_TIMESTAMP() AS database_utc_now;

SELECT name, batch FROM adonis_schema ORDER BY id;

SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (
 'inventory_balances','inventory_operations','inventory_movements',
 'inventory_order_consumptions','inventory_return_details',
 'product_option_inventory_components','inventory_mutation_requests'
) ORDER BY TABLE_NAME;

SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND (
 (TABLE_NAME = 'orders' AND COLUMN_NAME = 'inventory_version') OR
 (TABLE_NAME = 'order_items' AND COLUMN_NAME IN ('inventory_line_key','inventory_composition'))
) ORDER BY TABLE_NAME, COLUMN_NAME;

SELECT c.business_code, s.company_id, cr.location_id, s.id AS session_id,
       s.status, s.business_date, s.opened_at
FROM cash_register_sessions s
JOIN cash_registers cr ON cr.id = s.cash_register_id AND cr.company_id = s.company_id
JOIN companies c ON c.id = s.company_id
WHERE s.status = 'open' ORDER BY s.company_id, cr.location_id, s.id;

-- Posibles bloqueos antiguos: REVISAR, no actualizar masivamente.
SELECT c.business_code, o.company_id, o.location_id, o.cash_register_session_id,
       o.id AS order_id, o.order_number, o.status, o.is_served,
       o.served_at, o.paid_at, oi.id AS item_id, oi.kitchen_status
FROM orders o JOIN companies c ON c.id = o.company_id
JOIN order_items oi ON oi.order_id = o.id
WHERE o.status <> 'cancelled'
  AND (o.is_served = 1 OR (o.status = 'paid' AND o.is_prepaid = 0 AND o.is_advance_payment = 0))
  AND oi.kitchen_status IN ('in_preparation','pending','ready')
ORDER BY o.company_id, o.location_id, o.id, oi.id;

-- Después de migrar repetir los SELECT de esquema y comprobar:
-- 7 tablas / 3 columnas / 1 registro de migración; no asumir batch=7.
-- Si había DDL parcial o alguna otra migración pendiente, detenerse.
-- Nunca repetir la migración LOCAL ya aplicada, ni borrar saldos/movimientos.
