# B-1.2 · Inventario de bodega · DEMO FICTICIA

Ruta: `/bodega/inventario`. Permitida por la navegación existente para bodega, administrador y gerencia. Integración mínima en `src/app/navigation.tsx` autorizada por Bruno, con revisión solicitada a Jorge.

La pantalla usa `@/ui` y los tonos de `docs/07_GUIA_DISENO.md`. Muestra por producto físico, reservado, disponible y vencido; al lado, compras ordenadas o con recepción parcial. El filtro por código/nombre se aplica a ambos bloques. Las fechas esperadas se formatean en `es-EC`, zona `America/Guayaquil`.

## Datos y reemplazos temporales

`hooks.ts` contiene `useInventory(locationCode)`, `useProducts()` y `usePurchases()`, marcados `// temporal: reemplazar por @/data`. La sesión ya procede de `@/data`; los hooks reales de lectura de bodega aún no están exportados allí.

- `inventory` viene de `v_inventory`, generado por SQL con `demo_metadata.reference_at` y filtrado por ubicación; no recalcula saldos ni suma compras.
- `products`, `purchases` y `purchaseItems` vienen de los fixtures oficiales de CSV.
- `usePurchases()` entrega compras con `items`, con una lista explícita de campos que excluye `unit_cost_usd`. No hay costos en esta pantalla, tampoco para los otros roles.
- La cantidad de compra se etiqueta **Ordenado**, no como saldo pendiente de recibir: el fixture no aporta esa resta para recepciones parciales.
- Solo opera con `VITE_USE_MOCKS=true`, sesión operativa y rol autorizado. En modo real informa que la lectura aún no está disponible; no inventa una respuesta. Cache separada por ubicación y sesión. Esto no sustituye los permisos reales de RLS.

Cuando David entregue las lecturas, cambiar el import de hooks y retirar los temporales conservando el filtrado de costos. No se toca `src/data/` en este ticket.

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

## B-2.2 · UI y contrato de preparación (integración pendiente)

Este avance no modifica `navigation.tsx` ni la cola del PR #106, que todavía no estaba fusionado al prepararlo. El enlace del detalle se coordina tras su merge para mantener las ramas independientes.

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
