# AbasteceAI — Guía de diseño (colores, tipografía y reglas que simplifican)

> Versión 1.0 · 15-oct-2026 · Para **Jorge** (`src/ui/`, `src/app/`) y **Bruno** (`features/bodega`, `recepcion`, `logistica`…).
> Encaja con lo que ya existe en `front/jorge/j-0.2`: shadcn/ui + Tailwind 4 + Geist. **No hay que instalar nada nuevo.**
> Regla de oro: si una decisión visual no está aquí, usa el componente de `@/ui` tal cual viene y sigue.

---

## 1. Identidad en una línea

**Limpio, operativo y confiable.** Un panel de logística, no una landing. Fondo blanco, barra lateral oscura, un solo color de marca (verde azulado "limpieza") y colores de estado que significan siempre lo mismo en todas las pantallas.

---

## 2. Paleta de marca

| Rol | Hex | Tailwind equivalente | Dónde se usa |
|---|---|---|---|
| **Marca (primario)** | `#0F766E` | `teal-700` | Botón principal, enlaces, ítem activo del menú, ruta calculada en el mapa |
| Marca clara | `#14B8A6` | `teal-500` | Foco (`ring`), ítem activo en la barra oscura |
| Marca fondo | `#F0FDFA` | `teal-50` | Hover de filas, fondo de selección |
| Texto marca sobre claro | `#134E4A` | `teal-900` | Texto sobre `teal-50` |
| **Barra lateral** | `#0F172A` | `slate-900` | Sidebar y logo |
| Sidebar hover | `#1E293B` | `slate-800` | Hover / ítem activo de la sidebar |
| Texto principal | `#0F172A` | `slate-900` | Títulos y cuerpo |
| Texto secundario | `#64748B` | `slate-500` | Subtítulos, ayudas, fechas |
| Bordes | `#E2E8F0` | `slate-200` | Tarjetas, tablas, inputs |
| Fondo de página | `#F8FAFC` | `slate-50` | Detrás de tarjetas y tablas |
| Superficie | `#FFFFFF` | `white` | Tarjetas, tablas, modales |
| Peligro | `#DC2626` | `red-600` | Botón destructivo (cancelar pedido) |

Contraste comprobado: blanco sobre `#0F766E` = 5,5:1 y `slate-500` sobre blanco = 4,8:1. Ambos pasan WCAG AA, y se leen bien en el proyector.

### 2.1 Pegar en `frontend/src/index.css` (solo Jorge, una vez)

Reemplaza **solo estas variables** dentro de `:root`. El resto del archivo de shadcn queda igual.

```css
:root {
  --radius: 0.5rem;

  --background: #f8fafc;          /* slate-50: fondo de página */
  --foreground: #0f172a;          /* slate-900 */
  --card: #ffffff;
  --card-foreground: #0f172a;
  --popover: #ffffff;
  --popover-foreground: #0f172a;

  --primary: #0f766e;             /* teal-700: MARCA */
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;           /* slate-100 */
  --secondary-foreground: #0f172a;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;    /* slate-500 */
  --accent: #f0fdfa;              /* teal-50 */
  --accent-foreground: #134e4a;   /* teal-900 */
  --destructive: #dc2626;         /* red-600 */
  --border: #e2e8f0;              /* slate-200 */
  --input: #e2e8f0;
  --ring: #14b8a6;                /* teal-500 */

  --chart-1: #0d9488;             /* teal-600 */
  --chart-2: #0284c7;             /* sky-600 */
  --chart-3: #f59e0b;             /* amber-500 */
  --chart-4: #64748b;             /* slate-500 */
  --chart-5: #dc2626;             /* red-600 */

  --sidebar: #0f172a;             /* slate-900: barra lateral oscura */
  --sidebar-foreground: #cbd5e1;  /* slate-300 */
  --sidebar-primary: #14b8a6;     /* teal-500 */
  --sidebar-primary-foreground: #0f172a;
  --sidebar-accent: #1e293b;      /* slate-800 */
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: #1e293b;
  --sidebar-ring: #14b8a6;
}
```

**Sin modo oscuro.** Se puede borrar el bloque `.dark { … }` o dejarlo sin usar: no se prueba ni se presenta.

---

## 3. Colores de estado: 6 familias, un solo significado

En lugar de un color distinto por cada estado (hoy hay sky, indigo, blue, teal, orange, violet…), **cada estado pertenece a una de 6 familias**. El jurado aprende el código de colores en la primera pantalla y lo reconoce en todas las demás.

| Familia | Significa | Clases Tailwind (badge) |
|---|---|---|
| **Neutro** | Aún no pasa nada / cerrado sin acción | `border-slate-200 bg-slate-100 text-slate-700` |
| **En curso** | Avanza normal por el flujo | `border-sky-200 bg-sky-50 text-sky-800` |
| **Atención** | Requiere que alguien mire o falta un paso | `border-amber-200 bg-amber-50 text-amber-900` |
| **OK** | Terminado y verificado | `border-emerald-200 bg-emerald-50 text-emerald-800` |
| **Problema** | Diferencia, faltante, crítico | `border-red-200 bg-red-50 text-red-800` |
| **IA** | Lo propuso un modelo de IA | `border-violet-200 bg-violet-50 text-violet-800` |

> **Violeta es exclusivo de IA.** Si algo es violeta, lo propuso Jev o el asistente. Nada más usa violeta.

### 3.1 Mapa de estados reales (`db/`) → familia

| Tipo | Valor en la base | Etiqueta | Familia |
|---|---|---|---|
| Pedido | `draft` | Borrador | Neutro |
| Pedido | `submitted` | Enviado | En curso |
| Pedido | `approved` | Aprobado | En curso |
| Pedido | `preparing` | En preparación | **Atención** |
| Pedido | `ready` | Listo | En curso |
| Pedido | `shipped` | Despachado | En curso |
| Pedido | `delivered_unchecked` | Entregado sin conteo | **Atención** |
| Pedido | `reconciled` | Conciliado | OK |
| Pedido | `with_difference` | Con diferencia | **Problema** |
| Pedido | `cancelled` | Cancelado | Neutro + `line-through` |
| Envío | `created` | Creado | Neutro |
| Envío | `dispatched` | Despachado | En curso |
| Envío | `delivered_unchecked` | Entregado sin conteo | Atención |
| Envío | `reconciled` | Conciliado | OK |
| Envío | `with_difference` | Con diferencia | Problema |
| Cobertura | `critical` | Crítico | Problema |
| Cobertura | `attention` | Atención | Atención |
| Cobertura | `covered` | Cubierto | OK |
| Cobertura | `excess` | Exceso | Neutro *(antes violeta: se libera para IA)* |
| Incidencia | `severity = high` | Alta | Problema |
| Incidencia | `severity = medium` | Media | Atención |
| Incidencia | `severity = low` | Baja | Neutro |
| Incidencia | `status = open` / `under_review` / `resolved` | Abierta / En revisión / Resuelta | Atención / En curso / OK |
| Envío courier retrasado | (calculado en SQL) | Retrasado | Problema |
| Origen IA (`decision_logs.provider`) | `mock` | SIMULADO | Neutro, `font-mono` |
| Origen IA (`decision_logs.provider`) | `typesafe` (y `openai` en el asistente) | API_REAL | **IA** |
| Origen (`decision_logs.provider`) | `rules` | REGLAS | En curso, `font-mono` |
| Jev | `confidence < 0.80` | Revisión humana | Atención |

### 3.2 Cómo aplicarlo en código (Jorge, en `src/ui/`)

Un solo archivo con las 6 familias. `StatusBadge` y `AiSourceBadge` las usan, y nadie escribe clases de color sueltas en las pantallas.

```ts
// src/ui/tonos.ts
export const TONO = {
  neutro:   "border-slate-200 bg-slate-100 text-slate-700",
  curso:    "border-sky-200 bg-sky-50 text-sky-800",
  atencion: "border-amber-200 bg-amber-50 text-amber-900",
  ok:       "border-emerald-200 bg-emerald-50 text-emerald-800",
  problema: "border-red-200 bg-red-50 text-red-800",
  ia:       "border-violet-200 bg-violet-50 text-violet-800",
} as const;
export type Tono = keyof typeof TONO;
```

Origen de IA: la base guarda `provider` (`mock` / `typesafe` / `rules`), no la etiqueta. Convierte siempre con `fuenteDesdeProvider(provider)` (ya existe en `AiSourceBadge.tsx`) y pasa el resultado a `<AiSourceBadge source={…} />`. Nunca uses el valor crudo de la base como `source`.

Bruno: si necesitas un badge nuevo (p. ej. "Retrasado", "Lote vencido"), usa `<Badge className={TONO.problema}>` o pide a Jorge que lo agregue a `StatusBadge`. No inventes colores.

---

## 4. Elementos fijos de la marca

| Elemento | Cómo se ve |
|---|---|
| **Logo** | Texto, sin imagen: icono `PackageCheck` de lucide en `teal-500` + **Abastece**`AI` (la palabra en blanco semibold, "AI" en `teal-400`), dentro de la sidebar |
| **Banner DEMO FICTICIA** | Franja de 32 px arriba de todo, a ancho completo: `bg-amber-100 text-amber-900 border-b border-amber-300`, texto centrado en mayúsculas `text-xs font-semibold tracking-wide`: `DEMO FICTICIA · Todos los datos son simulados` |
| **Usuario y rol** | Arriba a la derecha: nombre + badge Neutro con el rol en español (Auxiliar, Supervisor, Administrador, Bodega, Logística, Compras, Gerencia) |

---

## 5. Tipografía

- **Una sola fuente: Geist** (ya instalada). No agregar otras.
- Códigos de negocio (`Q-001`, `PED-DEMO-001`, `INS-016`, `ENV-DEMO-008`, guías) en `font-mono`, con la mono del sistema (no se instala nada).
- **Números y cantidades:** `tabular-nums`, alineados a la derecha en tablas.

| Uso | Clases |
|---|---|
| Título de página | `text-2xl font-semibold tracking-tight` |
| Título de sección / tarjeta | `text-lg font-semibold` |
| Cuerpo | `text-sm` (tablas) · `text-base` (formularios y móvil) |
| Ayuda / metadato | `text-sm text-muted-foreground` |
| KPI grande (tablero) | `text-3xl font-semibold tabular-nums` |
| Código | `font-mono text-sm` |

---

## 6. Iconos (solo `lucide-react`, ya instalado)

Un icono fijo por módulo. Se usa el mismo en el menú, el título de página y los estados vacíos.

| Módulo | Icono |
|---|---|
| Pedidos | `ClipboardList` |
| Bandeja admin / aprobar | `ClipboardCheck` |
| Bodega / inventario | `Warehouse` |
| Preparación por lote | `PackageSearch` |
| Despacho | `Truck` |
| Recepción QR | `QrCode` |
| Trazabilidad | `Route` |
| Logística / mapa | `MapPinned` |
| Courier | `Plane` *(interprovincial)* |
| Tablero cobertura | `LayoutDashboard` |
| Incidencias | `TriangleAlert` |
| Asistente IA | `Sparkles` (en violeta, porque es IA) |
| Compras | `ShoppingCart` |

Tamaño: `size-4` en botones y tablas, `size-5` en el menú.

---

## 7. Layout único (todas las pantallas iguales)

```
┌───────────────────────────────────────────────────────────────┐
│  DEMO FICTICIA · Todos los datos son simulados    (banner)    │
├──────────────┬────────────────────────────────────────────────┤
│  AbasteceAI  │  Título de página            [Acción principal]│
│              │  Subtítulo en gris                             │
│  ▸ Pedidos   │  ───────────────────────────────────────────── │
│  ▸ Bodega    │  [filtros opcionales]                          │
│  ▸ …         │                                                │
│  (según rol) │  Tabla o contenido  (max-w-7xl, p-6)           │
│              │                                                │
│  Usuario/rol │                                                │
└──────────────┴────────────────────────────────────────────────┘
```

- Sidebar de `w-60` con fondo `--sidebar`. En móvil se oculta: botón de menú en el header.
- Contenido: `mx-auto max-w-7xl p-6 space-y-6`. Fondo `bg-background` (slate-50); las tarjetas y tablas son blancas.
- **Cada página empieza con el mismo `PageHeader`** (Jorge lo agrega a `@/ui`): `title`, `description`, `icon`, `actions`.
- **Máximo un botón `default` (teal) por pantalla.** Los demás son `outline` o `ghost`. Así el jurado siempre sabe qué hacer.

---

## 8. Patrones por tipo de pantalla

| Tipo | Patrón | Pantallas |
|---|---|---|
| **Lista** | `Table` dentro de `Card`. Columna 1 = código en `font-mono`, la última = estado (`StatusBadge`). Clic en la fila abre el detalle. Nada de tarjetas por ítem | Mis pedidos, bandeja admin, cola de bodega, envíos, incidencias, courier |
| **Detalle con decisión** | 2 columnas en `lg`: izquierda = datos y tabla de ítems; derecha (`w-80`) = alertas, propuesta IA y botones de decisión. En móvil se apila | Detalle admin, preparar pedido |
| **Comparación** | 2 tarjetas lado a lado con las diferencias resaltadas en `bg-amber-50` | Duplicado 001 vs 025, ruta referencia vs calculada |
| **Tablero** | Fila de 4 KPIs (tarjetas pequeñas: número grande + etiqueta) y debajo una tabla con filtro por ciudad | Tablero de cobertura |
| **Móvil** | Una columna, `text-base`, botones `h-12 w-full`, sin tablas: lista de ítems con un input numérico grande cada uno | Recepción QR |

### 8.1 Bloque "Propuesta de IA" (siempre igual)

```
┌ Sparkles  Propuesta de Jev            [API_REAL] ┐   ← borde violet-200, fondo violet-50
│ Urgencia: alta     Confianza: 0,86               │
│ Evidencia: nota del auxiliar, pedido adicional…  │
│ ⚠ Revisión humana (si confianza < 0,80)          │   ← badge Atención
└──────────────────────────────────────────────────┘
  [Aprobar]  [Devolver]  [Cancelar]   ← decisión HUMANA, fuera del bloque violeta
```

Los botones de decisión van **fuera** del bloque violeta: se ve que la IA propone y la persona decide.

### 8.2 Cantidades y faltantes

- Columnas: Solicitado · Aprobado · Preparado · Enviado · Contado · Aceptado (en ese orden y con esos nombres).
- Cuando una cantidad es menor que la anterior: celda `text-red-700 font-semibold`, y al lado `−2` en un badge Problema.
- La UI **no calcula**: muestra lo que trae `v_order_trace`.

### 8.3 Mapa (Leaflet)

| Elemento | Estilo |
|---|---|
| 676 puntos de catálogo | círculo de 3 px, `#94A3B8` (slate-400), sin borde |
| 24 puntos detallados | círculo de 6 px, `#0F766E` (marca), borde blanco |
| Bodega central BOD-DEMO | círculo de 9 px, `#0F172A` (slate-900), borde blanco |
| Ruta calculada (OR-Tools) | línea de 4 px, `#0F766E` |
| Ruta de referencia | línea de 3 px, `#94A3B8`, `dashArray: "6 6"` |
| Pedido no asignado | círculo de 6 px, `#DC2626` + motivo en la lista lateral |

Mapa base: OpenStreetMap estándar con su atribución visible.

---

## 9. Decisiones que simplifican (aplican a los dos)

1. **Solo modo claro.** Se ve mejor en el proyector y ahorra probar dos temas.
2. **Cero colores nuevos.** Solo la marca, slate y las 6 familias. Si falta uno, se pregunta en el grupo.
3. **Cero animaciones propias.** Solo las que trae shadcn (modal, toast).
4. **Tablas antes que tarjetas** para cualquier lista. Las tarjetas son solo para KPIs y bloques de detalle.
5. **Estados vacío / carga / error siempre** con `EmptyState`, `LoadingState` y `ErrorState`. Nunca una pantalla en blanco.
6. **Mensajes con toast:** `toast.success` al guardar y `toast.error` con el mensaje del backend tal cual.
7. **Botón deshabilitado mientras la llamada está en curso**, con texto "Guardando…".
8. **Textos en español y cortos.** Los estados se traducen con la tabla de §3.1; nunca se muestra `delivered_unchecked` crudo.
9. **Nunca un UUID en pantalla.** Solo códigos.
10. **Fechas** en formato `15 oct 2026, 14:30` (`Intl.DateTimeFormat('es-EC', …)` con la zona `America/Guayaquil`).
11. **Responsive solo donde importa:** la recepción tiene que ser perfecta en el teléfono. Para el resto basta con que no se rompa en móvil; la demo se presenta en laptop.
12. **Página `/ui` como referencia viva.** Cuando Jorge agregue `PageHeader` y `tonos.ts`, se ven ahí y Bruno copia de ahí.

---

## 10. Checklist antes de abrir un PR de frontend

- [ ] El banner DEMO FICTICIA está visible.
- [ ] Hay un solo botón primario (teal) en la pantalla.
- [ ] Los estados usan `StatusBadge` o `TONO.*`; no hay colores sueltos.
- [ ] Toda salida de IA tiene `AiSourceBadge` y el violeta se usa solo para IA.
- [ ] Los códigos van en `font-mono` y las cantidades en `tabular-nums`, a la derecha.
- [ ] La pantalla tiene estados vacío, carga y error.
- [ ] No aparece ningún UUID ni ningún estado en inglés.
- [ ] (Recepción) Se probó en el teléfono, con botones de `h-12`.
