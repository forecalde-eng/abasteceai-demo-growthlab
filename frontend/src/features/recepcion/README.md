# B-2.5 · Recepción móvil · DEMO FICTICIA

Ruta existente `/recepcion` (solo auxiliar). Su placeholder se sustituye por `Recepcion`, con el cambio mínimo en `navigation.tsx`, autorizado por Bruno y notificado a Jorge en #67. La dependencia `html5-qrcode` se añade al frontend (versión exacta) para leer el QR.

## Flujo

1. **Escanear** el QR (codifica `shipments.qr_token`) o **escribir la guía**.
2. Resolver el envío por token o guía, respetando los puntos del auxiliar.
3. **Contar y aceptar** por insumo: contado ≤ enviado, aceptado ≤ contado.
4. **Enviar** con `submitReceipt` (`POST /shipments/{id}/receipt`).

El faltante (enviado − contado) se muestra en la UI como información; el movimiento de stock, la incidencia `receipt_shortage` y el estado final los decide la base.

## Datos del seed y honestidad

El seed ya tiene ENV-DEMO-005 en `with_difference` (recibido). Al escribir GUIA-DEMO-005 la pantalla muestra «Este envío ya fue recibido», sin ofrecer un segundo conteo. El ciclo en vivo (PITCH 8) requiere que el backend cree un envío `dispatched` a un punto del auxiliar; eso llega con `fn_confirmar_ruta` + `fn_recibir`, no en esta tarea.

## Adaptadores temporales

- `submitReceipt.ts`: C1 con `// temporal: reemplazar por @/data`. JWT, sin rol/staff en el cuerpo, sin reintentos; en mocks informa que no se movió stock. `validateReceiptResult` exige estado `reconciled` o `with_difference`; `canSubmitReceipt` fija contado ≤ enviado y aceptado ≤ contado.
- `useShipmentByQr(qrToken)` y `useShipmentByGuide(guideCode)`: lecturas temporales sobre `@/mocks`, con alcance del auxiliar; en modo real avisan que falta conectar la lectura.

## Pruebas

Desde `frontend/`: `npx tsc --noEmit && npx vitest run && npm run build`.

Con Vite en `VITE_USE_MOCKS=true`, puerto 5174:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/recepcion/browser-test.cjs
playwright-cli close
```

Cubre: acceso auxiliar, botón de cámara en móvil, guía ya recibida con aviso honesto, PITCH-8 (INS-002 10 → contado 8 → faltante 2), conteo inválido bloqueado, doble clic como una sola llamada, error no presentado como éxito, sin UUID y 390 px sin desbordamiento. La página `pruebas/recepcion.html` usa un envío en estado `dispatched` controlado, solo para probar la UI; no escribe ni modifica fixtures.

## Pendiente

- `fn_recibir` en la base y envíos `dispatched` reales para validar PITCH 8 de punta a punta.
- La prueba física de cámara en el teléfono por HTTPS corresponde a B-3.1.
