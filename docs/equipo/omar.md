# Omar — Líder · FastAPI, auth, IA/RAG y rutas

> IA: **Claude Code**. Lee primero: `AGENTS.md`, `docs/04_SPEC_MAESTRA.md` (§4, §5 F4, §8), `docs/06_PLAN_EQUIPO.md`.
> Ramas: `ai/omar/<tarea>`. Además: integras, corres el guion, apruebas merges a `main` (con Claude revisando) y **presentas el pitch**.

## Tu misión

1. FastAPI **delgado**: valida token → rol → punto, llama a la función SQL de David y traduce errores. Nada de lógica de stock en Python.
2. Que la IA proponga con evidencia, etiquetada y registrada, y nunca decida.
3. Que las rutas respeten capacidad y ventanas.
4. Que `main` siempre funcione.

## Forma de cada endpoint de escritura

```python
@router.post("/shipments/{shipment_id}/dispatch")
def dispatch(shipment_id: UUID, staff: Staff = Depends(require_role("bodega", "logistica"))):
    return call_fn("fn_despachar", staff.id, shipment_id)   # una transacción; P04xx → HTTP
```

`call_fn` (en `app/db.py`): abre transacción, `SELECT abastece.fn_x(...)`, mapea `P0403/P0404/P0409/P0422` a 403/404/409/422 con el error uniforme de la spec §8.

## Reglas que más te afectan

- Jev: una llamada por versión del pedido; `AI_CALLS_ENABLED=false` por defecto; error → `human_review`.
- Asistente: recupera documentos **con el JWT del usuario** (RLS filtra `allowed_roles`), no con la secret key.
- Toda salida IA en `decision_logs` (`mock` → SIMULADO; `typesafe`/`openai` → API_REAL).
- Coordenadas ORS como `[lon, lat]`.

## Tareas

### Fase 0 — Mié noche

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-0.1 | ✅ `gh` con sesión; `main` protegida (PR obligatorio, squash, sin force push) | — |
| O-0.2 | ✅ `specs/000-contratos/openapi.yaml` (13 endpoints + `/me`, `dry_run`, `reset-demo`), `estados.md`, `roles.md` | Contrato mergeado |
| O-0.3 | ✅ `AGENTS.md` y `CODEOWNERS` en `main` | — |
| O-0.4 | Revisar con David `funciones.md` (C3) | Mergeado |
| O-0.5 | Esqueleto `backend/`: `uv`, FastAPI, `/health`, `db.py` (pool psycopg ≤ 5 + `call_fn`), `errors.py`, ruff + pytest, `.env.example` desde `db/config_backend.env.example` + `DATABASE_URL` | `uv run pytest` verde; `/health` OK |
| O-0.6 | Cuentas OpenAI, TypeSafe, HeiGIT con límite de gasto | Saldos verificados |

### Fase 1 — Jue 08:00–13:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-1.1 | `app/auth.py`: validar JWT, `get_current_staff`, `require_role`, `ensure_point` + `GET /me` | Auxiliar → `/me` con 3 puntos; `role: administrador` en el body → 403 |
| O-1.2 | `POST /orders`, `/orders/{id}/decision` → funciones de David | Errores P04xx salen como HTTP correcto |
| O-1.3 | `app/ai/jev.py`: `classify_notes` SIMULADO (desde `db/jev_respuesta_SIMULADA.json`), umbral 0,80 | — |
| O-1.4 | `POST /orders/{id}/analyze`: `fn_analizar_reglas` + `classify_notes` + `decision_logs` (`rules` y `mock`) | Bandeja admin muestra alertas y propuesta SIMULADO de 001 |
| O-1.5 | **I#1 13:00** | Lista de bugs con dueño |

### Fase 2 — Jue 14:00–18:00

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-2.1 | Endpoints `prepare` (+`dry_run`), `routes/confirm`, `shipments/courier`, `dispatch`, `delivered`, `receipt` → funciones de David | Ciclo preparar → confirmar → despachar → recibir por API |
| O-2.2 | `app/routing/`: matriz haversine × 1,3, VRPTW OR-Tools (peso, volumen, capacidad, ventanas, servicio, 07:30–17:30) + prueba | Pedido imposible → "no asignado" con motivo |
| O-2.3 | `POST /routes/plan` | Plan válido; no escribe nada |
| O-2.4 | **I#2 18:00** | PITCH 4, 5, 7, 8 + despacho de un pedido nuevo |

### Fase 3 — Jue 19:00–22:30

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-3.1 | `POST /admin/reset-demo`: `12_reset_demo.sql` → `03` → re-vincular cuentas (UUIDs en `.env`) | Guion → reset → guion idéntico |
| O-3.2 | **I#3**: ciclo PED-DEMO-001 dos veces con reset | Todos los MUST verdes o bugs para el viernes |

### Fase 4 — Vie

| ID | Tarea | Hecho cuando |
|---|---|---|
| O-4.1 | Jev real (basado en `db/integracion_jev.py`), switch `AI_CALLS_ENABLED`, timeout | Una llamada real con 001 → `typesafe`, API_REAL |
| O-4.2 | `app/ai/rag.py`: `websearch_to_tsquery('spanish', …)` con RLS del usuario | Auxiliar no recupera "Costos y compras DEMO" |
| O-4.3 | `POST /assistant`: RAG + funciones de lectura + Luna (o plantilla con IA apagada) + `decision_logs` (`openai`) | Cita "Recepción con diferencias DEMO · DEMO-1.1"; sin fuente → "no tengo una fuente" |
| O-4.4 | (Si sobra) pgvector + embeddings; ORS para los 10 puntos de Quito | — |
| O-4.5 | **I#4 14:00**, **freeze 20:00** | PITCH 3, 6, 9, 10 |

### Fase 5 — Sáb (pitch)

Presentas y vendes: problema, solución, por qué la IA solo propone. Muestras la escena 4 (rutas) y cierras con el asistente. Coordinas a Jorge, Bruno y David (guion en `06_PLAN_EQUIPO.md` §4). 2 ensayos con reset.

## Cómo revisar PRs (con Claude)

En esta carpeta, pídeme: *"revisa los PR abiertos"*. Reviso cada PR contra la spec, las invariantes I1–I12 y las pruebas. Si está bien, squash merge; si no, comento en el PR.

## Prompt de arranque

```text
Lee AGENTS.md, docs/04_SPEC_MAESTRA.md, docs/06_PLAN_EQUIPO.md y docs/equipo/omar.md.
Vamos a hacer la tarea O-0.5. FastAPI delgado: valida y llama a funciones SQL de David (§3 C3).
Corre `uv run pytest && uv run ruff check .` antes de commitear.
```
