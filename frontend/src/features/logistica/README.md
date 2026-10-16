# B-2.3 · Confirmar ruta mínima · DEMO FICTICIA

Ruta existente `/logistica/rutas` (logística). Su placeholder de B-4.2 se sustituye por `PlanRutas`, con el cambio mínimo en `navigation.tsx`, autorizado por Bruno y notificado a Jorge en #65.

## Qué hace

- Lista los pedidos `ready` de los puntos visibles (en el seed: solo PED-DEMO-007, punto Q-007).
- Elige un vehículo de `VEH-DEMO-1..3` (`db/datos/vehicles.csv`, generado por el generador oficial de `src/mocks`).
- Confirma la ruta con `confirmRoutes` (`POST /routes/confirm`), enviando paradas, pedidos, vehículo y fecha.

## Km y minutos: no se inventan

El contrato exige `estimated_km`, `estimated_minutes` y `planning_method`. La UI **no los calcula**. Solo los acepta de una propuesta del backend (`POST /routes/plan`). Mientras esa propuesta no exista:

- la pantalla muestra «Falta la propuesta del planificador»;
- el botón **Confirmar ruta** queda deshabilitado, aunque haya pedido listo y vehículo.

Esta decisión fue acordada con Bruno: usar los valores de la propuesta y no valores fijos de demo, para no registrar métricas que nadie calculó.

**Pendiente para el equipo:** implementar `POST /routes/plan` (B-4.2 / backend) y pasar su resultado a `PlanRutas` mediante `proposal`.

## Adaptadores temporales

- `confirmRoutes.ts`: C1 con `// temporal: reemplazar por @/data`. JWT de sesión, sin rol ni staff en el cuerpo, sin reintentos automáticos. En mocks indica que no se creó ningún envío.
- `validateRouteResult`: rechaza una respuesta que no tenga exactamente un envío `created` por pedido de la propuesta, ni guía vacía ni estados ajenos.
- `canConfirmRoute`: reglas de habilitación separadas y probadas (pedidos listos, vehículo, propuesta que cubre los pedidos, sin operación en curso ni confirmada).

## Pruebas

Desde `frontend/`: `npx tsc --noEmit && npx vitest run && npm run build`.

Con Vite en `VITE_USE_MOCKS=true`, puerto 5174, desde la raíz:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/logistica/browser-test.cjs
playwright-cli close
```

Cubre: solo PED-DEMO-007 listo, aviso de propuesta faltante, botón bloqueado incluso con vehículo elegido, sin UUID, móvil 375 px y acceso denegado al auxiliar.

## Lo que no cubre

No crea envíos reales. Los envíos `created` que necesita el despacho (B-2.4) aparecerán cuando el backend implemente `fn_confirmar_ruta` y exista la propuesta de rutas.
