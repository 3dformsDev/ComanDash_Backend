# COMANDASH v1.0.10 — preparación del despliegue

Preparado el 11/10/2026. Despliegue previsto para la mañana siguiente, ejecutado
por Eduard. Publicar estas ramas NO significa que estén instaladas en producción.

## Estado de preparación

Frontend publicado en GitHub: `df10881f07523ac31dd35f36f8f4f9480a7452af` en ambas
ramas v1.0.10. Eduard autorizó también cerrar la reutilización de conexiones:
servicios de inventario, rol, consultas relacionadas y validadores de órdenes
usan la transacción disponible. La auditoría aislada inicialmente falló en dos
servicios con pool ocupado; después del ajuste ambos pasaron. Se añadieron seis
regresiones que comprueban conexión, contexto, permisos, replay y validadores.
Paquete validado para publicación. Los SHA remotos de ambos
repositorios se registran en el manifiesto local, sin afirmar despliegue productivo.
La auditoría no accedió a DB ni establece una nueva causa física del incidente.

## Paquete

- Backend: `3dformsDev/ComanDash_Backend`, rama `release/v1.0.10`.
- Frontend: `3dformsDev/ComanDash_Frontend`, rama `release/v1.0.10`.
- Las ramas `feature/v1.0.10-inventario` conservan el mismo checkpoint del código.
- Fijar ambos SHA publicados en el manifiesto local antes de operar en el VPS.
- No se modifican `main`, ramas productivas anteriores ni etiquetas de producción.

Incluye inventario opcional de unidades completas por empresa/sede, entradas,
ajustes, mínimos/alertas, opciones con consumo, recuperación revisada en
cancelaciones/devoluciones, movimientos auditados y Excel en hora colombiana.
Costos/gestión de inventario: administración/gerencia; precio de venta y consultas
permitidas a perfiles operativos. También incluye cierre por todos los medios de
pago, liberación de mesas antiguas bajo confirmación y estilos ya aceptados.

Correcciones críticas: recuperación, inventario y validaciones de órdenes reutilizan la conexión de la transacción;
cocina rechaza cambios de comandas terminadas y productos despachados/servidos,
valida empresa/sede/orden/producto, libera transacciones en rechazos y
resincroniza al reconectar. Personalizaciones bloquea aperturas simultáneas.

Las fases de cocina son: `in_preparation` sin marcar; `pending` marcado,
pendiente de despachar y reversible; `ready` despachado y bloqueado; `served`
entregado y bloqueado. Los cobros anticipados conservan preparación/entrega.
Una ampliación antes del pago afecta los productos nuevos y conserva los anteriores.

## Validación local

- `npm run test:release-fixes`: 39 pruebas backend y 35 frontend.
- Backend: `npm run typecheck` y `npm run build`.
- Frontend: `npm run build`; advertencias conocidas de CommonJS/presupuesto no
  equivalen a un fallo de compilación.
- `git diff --check` y revisión de aislamiento, cambios, migración y exclusiones.
- Eduard aceptó inventario, permisos/cajero, estilos/calendarios, caja/mesas,
  venta normal/en mesa/para llevar, ampliaciones, anticipos, devoluciones,
  reconexión, marcar/desmarcar, protección del modal y cierre de caja.
- Pruebas backend aisladas con dobles: no sustituyen la verificación de MariaDB
  real, contenedores y PWA de producción mañana.
- Diagnóstico temporal `TABLES-DIAG` retirado. Mantener los registros operativos
  `[KITCHEN]`: identifican actor/contexto/cambios/rechazos sin incluir tokens.

## Hoy

Código y documentación publicados en GitHub después de validar. Copia local de
fuentes y manifiesto SHA-256 en `validation-inventory/release-v1.0.10-precommit`
fuera de los repositorios; excluye credenciales, uploads y artefactos generados.
No sustituye un dump ni un respaldo del servidor. No se toca producción hoy.
`AGENTS.md`, imágenes de pruebas, `.env`, credenciales y logs no se publican.

## Mañana: checkpoint antes de cualquier modificación

1. Acordar ventana sin operaciones/pagos en curso; si hay actividad, detener el
   procedimiento y coordinarla. No cerrar ni cancelar ventas por SQL para desplegar.
2. Registrar nombres/estado de contenedores, SHA/rama/status de ambos repos del
   VPS, imágenes actuales y rutas reales de Compose/Dockerfile/volúmenes/uploads.
   Los repos locales no contienen Dockerfile: no sustituir los del servidor.
   La composición raíz conocida usa servicios `backend`/`frontend`, pero hay que
   confirmar el archivo y las rutas activos mañana. No copiar el Compose local
   encima del productivo: puertos, env y montajes pueden diferir.
3. Ejecutar por separado `ops/release-v1.0.10/preflight.sql` en DBeaver PRODUCTIVO
   con la base correcta seleccionada. Confirmar migraciones anteriores, cajas y
   comandas incoherentes. Si aparecen inconsistencias, revisarlas antes de avanzar;
   no ejecutar correcciones masivas ni reutilizar IDs de incidentes anteriores.
4. Guardar respaldo completo y fresco del esquema productivo: tablas, datos,
   triggers, rutinas y eventos. El dump local de septiembre no sirve para este paso.
   El script `ops/release-v1.0.10/backup-before-deploy.sh`, revisado pero NO ejecutado
   por Codex, respalda DB/imágenes/metadatos después de confirmar sus argumentos.
5. Copiar configuración vigente, Compose/Dockerfiles/env/certificados si aplican y
   uploads en sus rutas reales a respaldo privado. No mostrar ni enviar secretos.
   Guardar SHA/producto anterior y verificar tamaños/hash y espacio para imágenes.
6. Continuar únicamente con autorización de la operación productiva y respaldo
   verificado. No cambiar ni reiniciar MariaDB/Redis ni el VPS dentro de este lote.
   El aviso de reinicio del sistema operativo se planifica aparte.

Lecturas iniciales seguras, desde cualquier carpeta del VPS:

```bash
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker inspect --format '{{.Name}} {{.Config.WorkingDir}} {{.Config.Image}} {{.Image}}' comandash_backend comandash_frontend
docker inspect --format '{{.Name}} {{json .Mounts}}' comandash_backend comandash_frontend comandash_mariadb
```

No pegar un `docker inspect` completo ni `docker compose config`: pueden exponer env.

## Base de datos y orden del despliegue

Migración nueva: `1788990000000_create_inventory_tables`. Ya aplicada LOCAL en
lote 7; no repetirla allí. Producción es otro esquema: confirmar su registro y
estructura antes de decidir si está pendiente. No asumir que su lote también sea 7.

Agrega `orders.inventory_version` (0 por defecto), `order_items.inventory_line_key`
y `inventory_composition` (null por defecto), y siete tablas: `inventory_balances`,
`inventory_operations`, `inventory_movements`, `inventory_order_consumptions`,
`inventory_return_details`, `product_option_inventory_components`,
`inventory_mutation_requests`. No activa stock ni modifica importes históricos.

1. Actualizar ambos checkouts a los SHA publicados, conservando env, configuración
   de Docker y uploads. Si hay cambios locales productivos no previstos, detenerse;
   no usar `git reset --hard`, `git clean`, descartes ni `pull` ciego.
2. `npm ci` y compilación de backend/frontend según la construcción verificada.
   El frontend generado (`www`) está fuera de Git y debe compilarse para la imagen.
   Preparar las imágenes nuevas sin sustituir todavía las activas. No ejecutar
   `docker compose down`, especialmente con `-v`.
3. Revisar `migration:status` con la imagen nueva y su contexto/entrada Ace reales,
   sin arrancar el servidor nuevo. Debe quedar pendiente exclusivamente la
   migración de inventario. Cualquier otra pendiente requiere revisión adicional.
4. En ventana sin escrituras y con respaldo verificado, aplicar esa migración
   desde el backend nuevo. Los comandos exactos de Compose/Ace se fijarán con
   las rutas/Dockerfiles comprobados mañana; no inventar una entrada del contenedor.
5. Verificar siete tablas, tres columnas, índices/reglas referenciales y un único
   registro de migración antes de arrancar backend nuevo. Si recién creadas,
   tablas de inventario vacías; si ya existían, no exigir cero ni borrar datos.
6. Si falla DDL, detenerse y leer esquema/registro/errores: MariaDB puede confirmar
   por etapas. No repetir automáticamente ni ejecutar rollback/reset de migraciones.
7. Recrear solo backend y después frontend, usando las imágenes nuevas verificadas.
   Comprobar salud HTTP/logs entre ambos pasos. Mantener MariaDB/Redis/volúmenes.

## Clientes/PWA y pruebas posteriores

Backend requiere `Idempotency-Key` en creación/edición/cancelación. Una PWA antigua
recibirá 409 solicitando actualizar; no debe eludirse la protección ni aceptar
ventas desde el cliente antiguo. Hacer que operadores actualicen/recarguen tras
publicar frontend, comprobar `ngsw.json`, assets y conexión socket. No borrar
almacenamiento del navegador sin revisar pedidos o solicitudes pendientes.

1. Login de administrador/operativo y consultas de caja/reportes sin esperas.
2. Inventario inicialmente opcional; consultas/roles/Excel funcionan. En un tenant
   de pruebas aprobado, confirmar descuento único directo/en opciones, sin segundo
   descuento en cocina/entrega/pago, y revisión de devolución recuperable.
3. Cocina: nuevo check/uncheck; despacho/entrega; ampliación con anteriores
   bloqueados; cobro anticipado y normal; pagadas/canceladas no reaparecen.
4. Personalizaciones: clic rápido abre un modal; precios, recibo y reporte correctos.
5. Cierre sin pendientes fantasma, sockets después de reconectar y PWA móvil/desktop.
6. Solo entonces declarar v1.0.10 instalada, registrar SHA/imágenes/esquema y
   actualizar las referencias productivas. No emitir etiqueta de producción antes.

## Reversión

Conservar ambas imágenes/SHA anteriores como pareja y la configuración vigente.
Si falla activación y aún no hay actividad de inventario, volver a esas imágenes
de aplicación bajo autorización; las tablas/columnas son aditivas y permanecen.
No tocar MariaDB/Redis, ejecutar `down` ni restaurar una DB automáticamente.

Si ya se activó inventario o hay movimientos/ventas posteriores, detener escrituras
y preservar datos primero. El código anterior no mantiene el nuevo libro: acordar
reconciliación antes de operar con él. Un dump anterior descarta datos posteriores;
restaurarlo exige autorización explícita y plan de recuperación. Nunca borrar el
libro, bajar la migración o eliminar volúmenes como procedimiento automático.

No se ha identificado qué dispositivo emitió los eventos del incidente anterior;
se verificaron las rutas que los admitían y su rechazo local, no una causa física
de red, cancelación o tiempo encendido del servidor.
