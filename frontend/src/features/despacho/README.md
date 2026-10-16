# B-2.4 · Despacho · DEMO FICTICIA

Ruta existente `/despacho` (bodega y logística); detalle y etiqueta en `/despacho?envio=<code>`. La integración mínima de `navigation.tsx` y la dependencia `qrcode.react` fueron autorizadas por Bruno y notificadas a Jorge en #66; se solicita su revisión del PR.

## Datos reales del seed, sin envíos creados inventados

Los cuatro envíos de `@/mocks` ya están despachados o en estados posteriores. La lista inicial de `created` muestra correctamente vacío; «Consultar etiquetas existentes» muestra los cuatro. No se altera ningún estado del CSV para habilitar un despacho. El envío creado debe llegar de `confirmRoutes` o `createCourier` (B-2.3/backend), que no se implementan en esta tarea.

`useShipments(filtro)` es un adaptador temporal en nuestra carpeta: reutiliza la lectura de demo de Jorge y su estado compartido, con sesión de `@/data` y alcance de bodega/logística. Con mocks apagados informa que falta conectar la lectura real. Sustituirlo por `@/data` cuando David lo entregue.

## Etiqueta y confirmación

- `EtiquetaEnvio` muestra códigos de envío, pedido, punto y guía. `QRCodeSVG` codifica el **qr_token** original, con margen de cuatro módulos; nunca imprime su UUID como texto.
- `Imprimir etiqueta` usa un portal directo en body: en impresión se oculta la aplicación y queda solo la etiqueta con DEMO FICTICIA, sin menú ni botones. El CSS solo se activa si existe ese portal.
- `PanelDespacho` permite despachar únicamente un envío `created` con pedido `ready`. Bloqueo inmediato de doble clic, botón deshabilitado durante la llamada, validación de la respuesta para el mismo envío/pedido y estados traducidos en pantalla.
- `dispatchShipment(id)` lleva `// temporal: reemplazar por @/data`. Respeta C1: POST `/shipments/{id}/dispatch`, sin body, JWT de sesión, sin rol/staff ni headers nuevos. No reintenta escrituras automáticamente. La idempotencia y los movimientos transaccionales corresponden al backend.
- En modo mocks el adaptador informa que no hay servicio y no afirma que haya movido stock. Una etiqueta no confirma un despacho ni una recepción.

## Pruebas y límites

Desde frontend/: `npx tsc --noEmit && npx vitest run && npm run build`.

Las pruebas de contrato verifican URL, JWT, ausencia de body, errores sin reintento, respuesta consistente y QR codificado desde qr_token. La página `pruebas/despachar.html` sirve solo en dev, con un envío del CSV presentado en un **estado anterior controlado** (`created`/pedido `ready`) para probar la UI. No añade registros ni modifica los fixtures; no demuestra la transacción SQL real.

Con Vite en modo `VITE_USE_MOCKS=true`, desde la raíz:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/despacho/browser-test.cjs
playwright-cli close
```

La validación end-to-end del despacho real sigue pendiente del endpoint y su función SQL. La interfaz y el adaptador pueden revisarse de forma independiente.
