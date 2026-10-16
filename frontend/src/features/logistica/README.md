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

## B-4.3 · Courier (solo lectura)

Ruta existente `/logistica/courier`, permiso de logística sin cambios. Bruno confirmó en #72 que asume Courier, mapa y rutas; el cambio mínimo del placeholder en `navigation.tsx` se notificó a Jorge antes de editarlo y se solicita su revisión.

`Courier.tsx` muestra envío/pedido, punto/ciudad, operador, guía, fecha prometida, estado y alerta de retraso. Filtros por código, guía, destino/operador y solo retrasados; enlace a la etiqueta existente de despacho. Usa `@/ui`, `StatusBadge` y `TONO.problema`, sin colores nuevos, UUID ni escrituras. Fechas formateadas en `es-EC` / `America/Guayaquil`.

### La demora la determina SQL, no el reloj del cliente

El generador oficial de `src/mocks/` ejecuta **la consulta de retrasos leída directamente de `db/04_consultas_demo.sql`**, sobre el seed y las vistas cargadas en PGlite. Publica `courierDelays` con sus columnas originales (`code`, `city`, `promised_delivery_at`, `status`) y `demoMetadata` con `reference_at`. No se modifica `db/`, no se agrega una columna/estado de negocio y no se importa SQL o PGlite desde la pantalla.

`useCourierShipments.ts` adapta el hook `useShipments` de la demo compartida y lo marca temporal para reemplazarlo por `@/data`. Cruza el listado SQL con los códigos courier. Si la sesión registra una entrega, retira el aviso anterior del snapshot, sin calcular fechas ni inventar nuevos retrasos. El flag `isDelayed` es solo una propiedad de presentación, no una columna de base ni un estado del envío. Sin mocks explícitos informa que falta la lectura real; los datos simulados no se presentan como datos de Supabase real.

PITCH-9: ENV-DEMO-008, GUIA-DEMO-008, destino G-001 / Guayaquil, estado Despachado y badge Retrasado. Prometido 10 oct 2026, 15:00 Ecuador; reloj del seed 10 oct 2026, 17:00 Ecuador.

### Comprobar Courier

```sh
node frontend/src/mocks/generate.mjs
node --test frontend/src/mocks/generate.test.mjs
```

En `frontend/`: `npx tsc --noEmit && npx vitest run && npm run build`.

Con Vite en `VITE_USE_MOCKS=true` y puerto 5174, desde raíz:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/logistica/courier-browser-test.cjs
playwright-cli close
```

Comprueba PITCH-9, filtros, reloj y fechas de Ecuador, acceso de logística, rechazo al auxiliar, etiqueta, 375 px, entrega registrada por el reemplazo del supervisor y error explícito si falta el reloj de demo.

## B-4.1 · Mapa Leaflet

Ruta existente `/logistica/mapa`, solo logística. Plan de archivos y dependencias enviado a Jorge en #70 antes de editar. Cambio mínimo en `navigation.tsx`: import + placeholder, sin tocar sesión ni guards de J-0.3. Las dependencias Leaflet/React Leaflet y sus tipos están fijadas en package/lock.

- `mapLocations` se genera desde **locations.csv completo**: 676 de catálogo + 24 detallados = 700 puntos de servicio, más BOD-DEMO (701 marcadores). TRA-DEMO y CUA-DEMO no se dibujan. `locations` conserva sus 27 filas originales para las otras pantallas.
- `useMapLocations.ts` ofrece un `useLocations('todos')` temporal en nuestra carpeta hasta que exista la lectura equivalente en `@/data`. Perfil desde `@/data`, solo mocks explícitos; no consulta Supabase desde componentes ni muestra mocks como datos reales.
- `MapaPuntos` carga Leaflet y su CSS de forma diferida. Usa CircleMarker, con tamaños/colores exactos de la guía §8.3 y detallados/bodega dibujados al final para no ocultarlos. Fondo OpenStreetMap estándar y atribución visible, sin API keys.
- Vista inicial de Quito, Guayaquil y Cuenca; controles de enfoque y selección por código (también mediante teclado). Las coordenadas siempre provienen del CSV, incluso para ajustar las vistas. No se calculan rutas, cobertura ni inventario; el catálogo no se muestra como desabastecido.
- Popup de código/nombre/ciudad/alcance, sin UUID. Datos ficticios indicados en banner y popup. Coordenadas inválidas no se sustituyen por posiciones inventadas. Si falla el fondo, quedan los puntos disponibles con un aviso.
- `mapa.css` acota dimensiones y aísla el apilamiento del mapa para no tapar el menú móvil. Los controles internos de zoom están en español.

Comprobaciones: regenerar fixtures y ejecutar su prueba; en frontend, `npx tsc --noEmit && npx vitest run && npm run build`. La carga de teselas necesita internet; la prueba automatizada sustituye solo esas imágenes para no descargar decenas de teselas, manteniendo Leaflet y los datos reales del seed.

Con Vite en `VITE_USE_MOCKS=true`, puerto 5174, desde raíz:

```sh
playwright-cli open http://127.0.0.1:5174
playwright-cli run-code --filename=frontend/src/features/logistica/mapa-browser-test.cjs
playwright-cli close
```

Valida conteos, colores/radios y ausencia de duplicados; las tres ciudades, popups por código, atribución, permisos, 375 px, estado vacío y fallo del fondo sin perder puntos. Mapa y catálogo no dependen del planificador de #71.
