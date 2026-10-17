# C2 · Datos de pedidos y operación

- `VITE_USE_MOCKS=true`: fixtures de `@/mocks`, con cambios de esta sesión en
  `mock-state.ts`. No modifica la carpeta de Bruno ni usa red para las acciones.
- `VITE_USE_MOCKS=false`: cliente tipado `Database`, esquema `abastece`, JWT y RLS.
  Solo claves publicables en `VITE_SUPABASE_PUBLISHABLE_KEY`. Las contraseñas demo
  siguen fuera del repositorio, según el mecanismo de login existente.
- `VITE_BACKEND_URL`: FastAPI; las escrituras usan el token de Supabase y no envían
  un staff/rol elegido por el navegador. Nunca se llama RPC de escritura desde UI.

Exportaciones C2: useOrders, useOrder, useProducts, useLocations, useIncidents,
useAnalysis, useShipments, useReplenishment, useDemoMetadata; createOrder,
analyzeOrder, decideOrder y markDelivered. Firmas compatibles con las pantallas.
No se cambia el contrato Me de useSession ni los tipos generados.

Las lecturas están paginadas y las claves de caché incluyen modo, cuenta, rol y
puntos. Las FK de envíos son las del esquema real: el punto se resuelve a través
 del pedido. El tablero consume v_replenishment sin recalcular las fórmulas.

## Recorrido admin

Bandeja → PED-DEMO-001 → análisis → INS-005 de 3 a 1 → motivo
`esperar COMPRA-DEMO-001` → aprobar. analyzeOrder devuelve AnalysisResult,
con proposal nullable conforme a OpenAPI; useAnalysis reconstruye los logs rules
/ IA por analysis_sequence. El log IA precargado solo no es un análisis completo:
se devuelve null hasta que exista detect_rules y la pantalla solicite el análisis.
Un 502 puede haber persistido human_review: se releen los datos, sin repetir POST.

Tras una escritura usar refreshOperationalData(queryClient): invalida las lecturas
reales y las claves temporales existentes, sin repetir la acción. Un fallo de red
o respuesta ambigua exige consultar estado antes de reintentar. No hay reintentos
automáticos de POST ni fallback silencioso a mocks cuando falla RLS o el backend.
El mes del formulario se obtiene del reloj demo en Ecuador, no del equipo local.

## Pruebas

En frontend: `npm ci --ignore-scripts`, `npx tsc --noEmit`, `npm test`,
`npm run build`. Vitest intercepta fetch con datos ficticios; no usa credenciales
ni hace escrituras remotas. Las pruebas específicas verifican URLs, esquema,
JWT, paginación, caché, errores y modo mock.

Pendiente de ensayo integrado: confirmar exposición del esquema en Data API,
configurar variables locales públicas y backend, y recorrer las pantallas con
las cuentas reales. Los tests aislados no demuestran ese ensayo remoto.
