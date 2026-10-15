# Jorge — Frontend: shell, pedidos, admin y tablero

> IA: **Claude Code** (lee `CLAUDE.md` → `AGENTS.md` sola). IDE: VS Code o Antigravity.
> Lee primero: `AGENTS.md`, `docs/04_SPEC_MAESTRA.md` (§2, §5 F0, F1, F4), `docs/06_PLAN_EQUIPO.md` (§2, §3 C2), **`docs/07_GUIA_DISENO.md` (colores, layout y patrones)**.
> Ramas: `front/jorge/<tarea>`.

## Tu misión

El esqueleto de la web que todos usan, y las pantallas donde se ve la "inteligencia": pedidos, alertas, propuesta de IA, decisión humana y tablero.

Eres dueño de `src/App.tsx`, `src/app/` y `src/ui/`: Bruno monta sus pantallas sobre tu layout.

## Reglas que más te afectan

- Nunca llames a Supabase ni a `fetch` directo: usa los hooks de `src/data/` (de David). Mientras no existan, `VITE_USE_MOCKS=true`.
- Banner **DEMO FICTICIA** siempre visible. Etiqueta **SIMULADO / API_REAL** junto a cada salida de IA.
- La UI no calcula cantidades, cobertura ni fechas: las muestra tal como vienen.
- Códigos visibles (`Q-001`, `PED-DEMO-001`, `INS-016`), nunca UUID.

## Stack

Vite + React + TypeScript + Tailwind + React Router + React Query. Componentes base: shadcn/ui [Supuesto: decides tú en J-0.1 y Bruno lo sigue].

## Tareas

### Fase 0 — Mié noche

| ID | Tarea | Hecho cuando |
|---|---|---|
| J-0.1 | Esqueleto `frontend/`: Vite + React + TS + Tailwind + Router + React Query; `.env.example` desde `db/config_frontend.env.example`; scripts `dev`, `build`, `typecheck` | `npm run build` OK |
| J-0.2 | `src/ui/` según `docs/07_GUIA_DISENO.md` (paleta en `index.css`, `tonos.ts`, `PageHeader`): botón, tarjeta, tabla, badge de estado (pedido, envío, cobertura), badge SIMULADO/API_REAL, modal, toast, estados vacío/carga/error | Página `/ui` con todo a la vista para Bruno |
| J-0.3 | Login con Supabase Auth, sesión, guard de rutas | Las 7 cuentas entran |
| J-0.4 | Layout por rol: menú según `useSession().role`, banner DEMO FICTICIA, una ruta vacía por pantalla (las de Bruno incluidas) | Cada rol ve solo sus pantallas |

### Fase 1 — Jue 08:00–13:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| J-1.1 | **Crear pedido** (auxiliar/supervisor): punto (solo asignados), mes, catálogo de 30 productos con cantidades, observaciones, tipo adicional (pedido original + motivo) | Pedido creado aparece en "Mis pedidos"; doble clic no duplica |
| J-1.2 | **Mis pedidos**: lista con estado y enlace a trazabilidad (componente de Bruno) | Auxiliar ve solo pedidos de Q-001/005/008 |
| J-1.3 | **Bandeja admin**: pedidos `submitted` con contador de alertas | 001, 002, 025 visibles con sus alertas |
| J-1.4 | **Detalle admin**: alertas (duplicado con comparación lado a lado 001 vs 025; omisión INS-016), propuesta Jev con badge y confianza, cantidades editables, botones aprobar / devolver / cancelar con motivo obligatorio | PITCH 1, 2, 3 en pantalla |

### Fase 2 — Jue 14:00–18:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| J-2.1 | **Supervisor**: envíos de sus puntos, botón "Marcar entregado (sin conteo)" con aviso de que no suma stock | PITCH 7: PED-DEMO-004 visible como `delivered_unchecked` |
| J-2.2 | **Tablero** (gerencia/admin): 24 puntos desde `useReplenishment`, filtro por ciudad, tarjetas por estado de cobertura, recomendado y entradas confirmadas aparte | Q-001 cambia tras el ciclo en vivo |
| J-2.3 | **Incidencias**: lista con tipo, severidad, pedido/envío | Las 7 del seed + nuevas |

### Fase 3 — Jue 19:00–22:30

| ID | Tarea | Hecho cuando |
|---|---|---|
| J-3.1 | Arreglos de I#3 en tus pantallas | Ciclo en vivo sin tropiezos en pedidos/admin |
| J-3.2 | (Opcional) Cambio rápido de cuenta para el pitch, solo en modo dev, contraseñas desde `.env.local` (nunca en el repo) | Pasar de admin a bodega en 2 clics |

### Fase 4 — Vie

| ID | Tarea | Hecho cuando |
|---|---|---|
| J-4.1 | **Asistente**: chat, respuestas con fuentes (título + versión), badge SIMULADO/API_REAL, sugerencias de preguntas | PITCH 10 |
| J-4.2 | Pulido visual: consistencia, textos del guion, responsive | Revisión del equipo |

### Fase 5 — Sáb (pitch)

Muestras las **escenas 1–2**: duplicado 001/025, admin cancela 025, aprueba 001 con INS-005 = 1 y se ve la propuesta de Jev. 1–2 min.

## Prompt de arranque para tu IA

```text
Lee AGENTS.md, docs/04_SPEC_MAESTRA.md, docs/06_PLAN_EQUIPO.md, docs/07_GUIA_DISENO.md y docs/equipo/jorge.md.
Vamos a hacer la tarea J-0.1. No llames a Supabase directo: todo pasa por frontend/src/data/.
Antes de escribir código dime qué archivos vas a crear.
Corre `npx tsc --noEmit && npm run build` antes de commitear.
```
