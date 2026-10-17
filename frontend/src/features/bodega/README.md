# B-1.2 · Inventario de bodega · DEMO FICTICIA

Ruta: `/bodega/inventario`. Permitida por la navegación existente para bodega, administrador y gerencia. Integración mínima en `src/app/navigation.tsx` autorizada por Bruno, con revisión solicitada a Jorge.

La pantalla usa `@/ui` y los tonos de `docs/07_GUIA_DISENO.md`. Muestra por producto físico, reservado, disponible y vencido; al lado, compras ordenadas o con recepción parcial. El filtro por código/nombre se aplica a ambos bloques. Las fechas esperadas se formatean en `es-EC`, zona `America/Guayaquil`.

## Datos y lecturas

`InventarioBodega.tsx` lee `useInventory(locationCode)`, `useProducts()` y `usePurchases()` desde `@/data` (C2, David). Ya no hay capa temporal en esta feature.

- `useInventory` resuelve el código del punto y lee `v_inventory` (SQL, con `demo_metadata.reference_at`) filtrado por `location_id`; RLS aplica el alcance real.
- `useProducts` viene del catálogo de `@/data`.
- `usePurchases` entrega compras con `items`. Para bodega lee la vista `v_warehouse_purchase_items` (sin costos); administración, compras y gerencia leen `purchase_order_items` por RLS. La tabla no incluye `unit_cost_usd` en esta pantalla.
- La cantidad de compra se etiqueta **Ordenado**, no como saldo pendiente de recibir: no se resta lo ya recibido en recepciones parciales.
- Con `VITE_USE_MOCKS=true` los hooks devuelven los fixtures oficiales; sin mocks leen Supabase. Una compra pendiente nunca suma al disponible. Esto no sustituye los permisos reales de RLS.

## Comprobaciones

Desde `frontend/`:

```sh
npx tsc --noEmit
npx vitest run
npm run build
```

Levantar Vite con `VITE_USE_MOCKS=true` (en `.env.local` de desarrollo o variable de entorno) y puerto libre, por ejemplo `npm run dev -- --host 127.0.0.1 --port 5174 --strictPort`. La prueba se ejecuta desde la raíz con playwright-cli ya instalado:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/bodega/browser-test.cjs
playwright-cli close
```

La prueba valida PITCH-5: INS-005 = 8 físico / 7 reservado / 1 disponible / 0 vencido, y COMPRA-DEMO-001 con 100 ordenados en estado pendiente. También filtros, sin UUID ni costos visibles, acceso por rol, adaptación a 375 px y fallo de carga sin inventar saldos.

## B-2.2 · UI y contrato de preparación

Tras integrar `main` con el PR #106, la cola y el detalle comparten `/bodega/preparar`: sin query muestra la lista; con `?pedido=<code>` muestra la preparación. Cada fila tiene el enlace **Preparar** y el detalle permite **Volver a la cola**. No se modifica `navigation.tsx` para esta integración: conserva su entrada y permisos originales.

`PrepararPedido.tsx` lee `?pedido=<code>` y compone el editor usando el detalle temporal de Jorge. `PreparacionEditor.tsx` pide cantidades válidas y una vista previa antes de confirmar; cualquier edición invalida el plan. El bloqueo inmediato evita dos solicitudes por doble clic. La respuesta de confirmación manda el estado (`ready` o `preparing`) y su código de incidencia; no se recalculan FEFO, reservas, saldos ni faltantes.

`prepareOrder.ts` es el adaptador temporal C1 para reemplazar por `@/data`: `POST /orders/{id}/prepare?dry_run=...`, cuerpo `{ items }`, JWT de la sesión y ningún rol/staff enviado por el cliente. No reintenta escrituras automáticamente. En modo mocks indica que falta el servicio y **no finge una preparación**. El detalle de lectura real también sigue pendiente de David. No se puede demostrar la operación completa hasta que llegue el backend.

La validación de respuesta rechaza otro pedido, cantidades inconsistentes y lotes vencidos respecto de la fecha del CSV `demo_metadata`; no selecciona lotes alternativos. La selección y exclusión reales siguen siendo responsabilidad de SQL.

La página aislada `pruebas/preparar.html` solo sirve en dev para pruebas de UI. Inyecta por props respuestas controladas con cantidades de `order_items.csv` y lotes existentes de los CSV. PED-DEMO-003 no tiene reservas propias en el seed; el escenario combina sus cantidades con lotes del mismo producto para probar la presentación del contrato, **no afirma que sean reservas reales ni una propuesta oficial FEFO**. No persiste ni modifica datos. Esta página no es una entrada de la build.

Pruebas adicionales desde frontend/: `npx vitest run src/features/bodega/prepareOrder.test.ts`. Prueba de navegador con Vite activo, desde raíz:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/bodega/preparar-browser-test.cjs
playwright-cli close
```

Verifica vista previa sin confirmación, edición que invalida el plan, validación de cantidades, confirmación única, rechazo de lote vencido, mensaje de error y estados `preparing`/`ready` devueltos por el servicio controlado. No sustituye la prueba integrada de `fn_preparar`.

### B-3.2 · Correcciones de integración (#69)

- Cada cantidad inválida explica el bloqueo junto al insumo: campo vacío, negativo/no numérico, mayor que lo aprobado o más de tres decimales. `aria-invalid` y `aria-describedby` enlazan el aviso al campo. Al corregir se habilita una nueva vista previa, pero no se recupera el plan anterior.
- C1 permite omitir `lots[].expires_on`. Esa respuesta se acepta y se muestra como **Sin fecha informada**, sin asumir que el lote no vence. `null` sigue mostrándose como **Sin vencimiento**. Una fecha informada debe existir en el calendario; si está vencida al reloj de demo, se sigue bloqueando la confirmación.
- `preparar-browser-test.cjs` cubre estos casos y la recuperación del formulario, incluyendo 375 px. El modo `missing-expiry` del fixture aislado reproduce la respuesta sin fecha; no altera CSV ni reservas.

Esta entrega es **Parte de #69**: no demuestra el ciclo I#3 real. Siguen pendientes las lecturas C2 de `@/data` y la ejecución integrada de las funciones SQL y los endpoints correspondientes. No se cierran #64 ni #69 con estas pruebas controladas.

## B-2.1 · Cola de bodega

`ColaBodega.tsx` ocupa la ruta existente `/bodega/preparar`, con autorización de Bruno y revisión de Jorge. Mantiene el menú y los permisos originales (solo bodega) y permite abrir el detalle B-2.2 por código en la query.

Muestra solo pedidos `approved` y `preparing`, estado traducido, punto, fecha aprobada y las incidencias de empaque no resueltas. PED-DEMO-003 aparece «En preparación» con INC-EMPAQUE y su descripción original. Sin sumar ni recalcular faltantes; el enlace permite consultar la trazabilidad por código. Incluye filtro por estado/pedido/punto, actualizar y estados de carga/vacío/error.

`queueHooks.ts` adapta `useOrders(filtro)`, `useIncidents(filtro)` y `useLocations(scope)` con la marca temporal para reemplazar por `@/data`. Reutiliza `@/app/dev/apiDemo`, que ya contiene los CSV y las decisiones de esa sesión de demo, para que una aprobación desde admin aparezca en la cola sin duplicar escrituras. El perfil/rol procede de `@/data`; con mocks apagados informa que falta la lectura real. No modifica la capa de Jorge ni la de David. Los reemplazos siguen siendo solo una demo, no permisos reales de RLS.

Prueba adicional, con Vite en modo mocks y sin decisiones previas en esa sesión de navegador:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/bodega/cola-browser-test.cjs
playwright-cli close
```

Valida los cuatro pedidos del seed en cola (003, 006, 010 y 026), PITCH-4 con incidencia, filtros, URL de trazabilidad, alcance por rol, 375 px y una aprobación de prueba desde el reemplazo compartido de Jorge. La aprobación solo vive en memoria y desaparece al recargar.
