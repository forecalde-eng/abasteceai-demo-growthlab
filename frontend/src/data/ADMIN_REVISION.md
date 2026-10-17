# D-1.4 · Administración · revisión de integración

PR #143, actualizado con main que incluye #146. No incorpora los PR #144/#145 ni ejecuta reset, re-vinculación, decisiones o análisis remotos.

## Comprobaciones del recorrido del pitch

- Bandeja usa pedidos de C2 y muestra solo `submitted`; abrir PED-DEMO-001 usa su código en la URL.
- Detalle espera el resultado de la lectura de `useAnalysis`: una lectura pendiente o fallida no dispara POST. Si ya existe análisis completo, se muestra sin recalcular. Si la lectura confirma `null`, se solicita una vez. Un HTTP 502 relee la propuesta persistida; no repite automáticamente el POST.
- INS-005 permite cambiar la cantidad aprobada a 1. Al aprobar una corrección, se exige motivo; el ensayo utiliza exactamente `esperar COMPRA-DEMO-001`.
- Escrituras: `/orders/{id}/analyze` y `/orders/{id}/decision`, con JWT. Las pruebas usan respuestas HTTP interceptadas y datos ficticios; no son una aprobación real del pedido.
- La propuesta muestra `SIMULADO` o `API_REAL` incluso sin respuestas estructuradas. `human_review` siempre queda visible; no se deduce que hubo timeout solo por ese estado.

## Pruebas

`npx tsc --noEmit`, `npx vitest run`, `npm run build`, `git diff --check`.

`admin-view.test.tsx` verifica el componente con respuestas de C2 controladas: origen de IA, revisión humana, cantidades editables y ausencia de propuesta. Las pruebas de API/lecturas verifican JWT, rutas, errores, paginación y reglas de caché.

Ensayo Chromium con el SDK real y HTTP interceptado: retrasar el GET de logs no produce POST prematuro; un análisis existente no se recalcula; una lectura fallida no escribe; una lectura que confirma ausencia solicita análisis una vez; corrección INS-005=1 con motivo viaja al endpoint de decisión. El ensayo de cuentas y pantallas contra Supabase real sigue pendiente de exposición Data API y entrega privada de credenciales.
