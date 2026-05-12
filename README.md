# Guía de Configuración y Flujo del Sistema de Comandas

Este documento describe las fases para configurar y operar un negocio en el sistema de comandas.

---

## **Fase 1: Configuración Inicial del Negocio (Onboarding)**

En esta fase se establece la estructura base de la empresa en el sistema.

### 1. Crear la Empresa
- Registrar el negocio en la tabla `companies`.
- Definir:
  - Nombre del negocio.
  - Código único.
  - Plan de suscripción.

### 2. Configurar Sucursales
- Crear una o varias sucursales en `locations`.
- Incluso si hay un solo local, debe registrarse como sucursal.
- Marcar una como principal (`is_main = true`).

### 3. Ajustes Generales
- Configurar las reglas básicas en `company_settings`:
  - Porcentaje de impuesto.
  - Moneda local.
  - Si se acepta propina por defecto.

---

## **Fase 2: Preparación para Operar**

Con la estructura creada, se cargan los datos necesarios para la operación diaria.

### 1. Añadir Personal
- Crear cuentas de empleados en la tabla `users`.
- Asignar:
  - Compañía.
  - Sucursal.
  - Rol (administrador, mesero, cajero, etc.).

### 2. Definir Métodos de Pago
- Registrar métodos de pago en `payment_methods`:
  - Ejemplos: Efectivo, Tarjeta de Crédito, Nequi.

### 3. Construir el Menú
- Crear **categorías** en `categories` (Ej: Bebidas, Entradas, Platos Fuertes).
- Agregar **productos** en `products`:
  - Nombre.
  - Precio.
  - Detalles adicionales.

### 4. Organizar el Espacio Físico
- Registrar **mesas** en `tables` con su número y capacidad.
- Registrar **cajas registradoras** en `cash_registers` y asignarlas a la sucursal correspondiente.

---

## **Fase 3: Operaciones Diarias (Flujo de Venta)**

Con la configuración lista, el negocio está preparado para atender clientes.

### 1. Iniciar Turno (Apertura de Caja)
- Un cajero abre una sesión en `cash_register_sessions`.
- Introduce el monto inicial (`opening_balance`) para cuadre al final del turno.

### 2. Tomar una Orden
- Un mesero crea un registro en `orders`:
  - **Para mesa:** `order_type = 'dine_in'` y asociar `table_id`.
  - **Para llevar:** `order_type = 'takeaway'`, `table_id = NULL`, y opcionalmente `customer_name`.

### 3. Añadir Productos al Pedido
- Cada producto crea un registro en `order_items`.
- Estado inicial: `pending`.

### 4. Proceso en Cocina
- Cocina ve los `order_items` con estado `pending`.
- Estados de cocina (`kitchen_status`):
  - `in_preparation`.
  - `ready`.
  - `served` (cuando se entrega al mesero).

### 5. Cerrar la Cuenta (Pago)
- Calcular total de la orden.
- Registrar pago en `order_payments`:
  - Si hay múltiples métodos, se crean varios registros.
- Si el pago es en efectivo:
  - Registrar en `cash_movements` y asociar a la sesión de caja.
- Actualizar estado de la orden a `paid`.

---

## **Fase 4: Cierre y Reportes**

Procesos de cierre y análisis de operaciones.

### 1. Cerrar el Turno (Cierre de Caja)
- Finalizar la sesión en `cash_register_sessions`.
- Sistema calcula ventas en efectivo (`closing_balance`).
- Cajero ingresa el dinero contado (`real_closing_balance`) y el sistema detecta diferencias.

### 2. Consultar Reportes
- Un proceso automático genera registros en `daily_summaries`.
- Permite a los administradores ver:
  - Ingresos totales.
  - Número de órdenes.
  - Indicadores clave sin recalcular datos manualmente.

### 3. Auditoría
- Revisar la tabla `activity_logs` en caso de dudas o inconsistencias:
  - Ejemplo: descuentos no autorizados, órdenes canceladas, etc.

---

## **Resumen**
Este flujo permite:
- **Estandarizar la configuración inicial.**
- **Facilitar la operación diaria.**
- **Garantizar control y trazabilidad de todas las acciones.**
