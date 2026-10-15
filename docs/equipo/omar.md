# Omar — Líder · APIs, auth, IA/RAG y rutas

> Lee primero: `AGENTS.md`, `docs/04_SPEC_MAESTRA.md` (§4, §5 F4, §8), `docs/06_PLAN_EQUIPO.md`.
> Ramas: `ai/omar/<tarea>`. Además: integras, corres el guion y apruebas merges a `main` (con Claude revisando).

## Tu misión

1. Que nadie haga nada que su rol y sus puntos no permiten (JWT → rol → punto).
2. Que la IA proponga con evidencia, etiquetada y registrada, y nunca decida.
3. Que las rutas respeten capacidad y ventanas.
4. Que `main` siempre funcione.

## Reglas que más te afectan

- Jev: una llamada por versión del pedido; `AI_CALLS_ENABLED=false` por defecto; error → `human_review`.
- Asistente: recupera documentos **con el JWT del usuario** (RLS filtra `allowed_roles`), no con la secret key.
- Toda salida IA en `decision_logs` con `provider` (`mock` → SIMULADO; `typesafe`/`openai` → API_REAL).
- Coordenadas ORS como `[lon, lat]`.

## Tareas

### Fase 0 — Mié noche

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-0.1 | `gh auth login`; proteger `main` (PR obligatorio, sin push directo) | Push directo a `main` rechazado |
| O-0.2 | `specs/000-contratos/openapi.yaml` (13 endpoints + `/me`, `dry_run`, `reset-demo`), `estados.md`, `roles.md` — con David | PR mergeado = contrato congelado |
| O-0.3 | ✅ `AGENTS.md` y `CODEOWNERS` en `main` | Los 4 lo leen |
| O-0.4 | Cuentas OpenAI, TypeSafe, HeiGIT con límite de gasto; claves solo en tu `.env` | Saldos verificados |

### Fase 1 — Jue 08:00–13:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-1.1 | `app/auth.py`: validar JWT de Supabase, `get_current_staff`, `require_role`, `ensure_point` + `GET /me` | Auxiliar → `/me` con 3 puntos; body con `role: administrador` → 403 |
| O-1.2 | `app/ai/jev.py`: `classify_notes` SIMULADO (desde `db/jev_respuesta_SIMULADA.json`), umbral 0,80, `decision_logs` | `/analyze` de 001 muestra propuesta SIMULADO en la bandeja admin |
| O-1.3 | **I#1 13:00**: merges + reset + guion | Lista de bugs con dueño |

### Fase 2 — Jue 14:00–18:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-2.1 | `app/routing/`: matriz haversine × 1,3, VRPTW OR-Tools (peso, volumen, capacidad, ventanas, servicio, 07:30–17:30) + unitaria | Pedido imposible → "no asignado" con motivo |
| O-2.2 | `POST /routes/plan` | `test_pitch_6`: plan válido, nada escrito |
| O-2.3 | **I#2 18:00** | PITCH 4, 5, 7, 8 + despacho de un pedido nuevo |

### Fase 3 — Jue 19:00–22:30

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-3.1 | **I#3**: ciclo en vivo PED-DEMO-001 dos veces con reset | Todos los MUST verdes, o lista de bugs para el viernes |

### Fase 4 — Vie

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-4.1 | Jev real: cliente basado en `db/integracion_jev.py`, switch `AI_CALLS_ENABLED`, timeout | Una llamada real con 001 → `typesafe`, API_REAL |
| O-4.2 | `app/ai/rag.py`: `websearch_to_tsquery('spanish', …)` sobre `document_chunks` con RLS del usuario (`SET LOCAL ROLE authenticated` + `request.jwt.claims`) | Auxiliar no recupera "Costos y compras DEMO" |
| O-4.3 | `POST /assistant`: RAG + funciones de lectura + Luna (o plantilla si IA apagada) + `decision_logs` (`openai`) | `test_pitch_10`: cita "Recepción con diferencias DEMO · DEMO-1.1"; sin fuente → "no tengo una fuente" |
| O-4.4 | (Si sobra) `05_rag_vector_opcional.sql` + embeddings de los 8 chunks + búsqueda híbrida | Misma pregunta, mismas citas |
| O-4.5 | (Si sobra) Matriz ORS para los 10 puntos de Quito | `matrix_source=openrouteservice` |
| O-4.6 | **I#4 14:00** y **freeze 20:00** | PITCH 3, 6, 9, 10 |

### Fase 5 — Sáb

Guion, narración, 2 ensayos con reset, decisión final en vivo vs precargado.

## Cómo revisar PRs (con Claude)

En esta carpeta, pídele a Claude: *"revisa los PR abiertos"*. Revisa cada PR contra la spec, las invariantes I1–I12 y las pruebas. Si todo está bien, hace squash merge; si no, comenta en el PR.

## Prompt de arranque para tu IA

```text
Lee AGENTS.md, docs/04_SPEC_MAESTRA.md, docs/06_PLAN_EQUIPO.md y docs/equipo/omar.md.
Vamos a hacer la tarea O-1.1. Respeta la firma de C3 en docs/06_PLAN_EQUIPO.md §3:
David ya usa get_current_staff y require_role desde sus routers.
Corre `uv run pytest && uv run ruff check .` antes de commitear.
```
