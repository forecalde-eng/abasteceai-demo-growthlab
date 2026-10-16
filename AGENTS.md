# AbasteceAI — Reglas para agentes de IA

Hackathon Expo Clean Ecuador 2026, Reto 1. Abastecimiento de insumos de limpieza desde una bodega central (BOD-DEMO, Quito) a puntos de servicio. **Todos los datos son ficticios.**

## Antes de trabajar

1. Lee `docs/04_SPEC_MAESTRA.md` (qué se construye), `docs/06_PLAN_EQUIPO.md` (quién hace qué y los contratos) y la hoja de tu persona en `docs/equipo/` (omar, david, jorge, bruno).
2. Trabaja **una tarea por sesión**, por su ID (ej. `B-2.5`). Antes de escribir código, di qué archivos vas a crear o tocar.
3. **Frontend:** sigue `docs/07_GUIA_DISENO.md` (paleta, 6 familias de color de estado, layout y patrones). No inventes colores ni estilos.
4. Solo toca las carpetas de tu persona (`docs/06_PLAN_EQUIPO.md §2`). Si necesitas cambiar algo ajeno, dilo y propón un PR aparte.
5. Si algo no está en la spec, el contrato o `db/`, **pregunta**. No inventes endpoints, columnas, datos ni métricas.
6. **No esperes a nadie.** Si tu ticket necesita algo de otra persona que aún no existe (mocks, hooks, tipos, un endpoint), crea un reemplazo temporal **en tu propia carpeta**, con el nombre exacto del contrato (`specs/000-contratos/`, `docs/06_PLAN_EQUIPO.md §3`) y datos copiados de `db/datos/*.csv`. Márcalo con `// temporal: reemplazar por <lo real>` y sigue. Cuando el dueño lo entregue, cambias el import y lo borras.
7. Cada tarea en una rama nueva desde `main` actualizado. **No encadenes PRs** (el repo solo admite squash).

## Stack

- Backend: Python 3.11+ · FastAPI **delgado** (valida JWT, rol y punto; llama a una función SQL) · `uv` · psycopg · pytest · ruff. Carpeta `backend/`.
- Lógica de escritura: **funciones SQL** `abastece.fn_*` en `db/09+` (contrato en `docs/06_PLAN_EQUIPO.md §3 C3`), probadas con `node db/verificar_funciones.mjs`.
- Frontend: React + TypeScript + Vite + Tailwind + React Router + React Query · Leaflet. Carpeta `frontend/`.
- Datos: Supabase (Postgres + Auth + RLS), esquema `abastece`. `db/*.sql` es la fuente de verdad.
- Contrato API: `specs/000-contratos/openapi.yaml` (congelado).
- Rutas: OR-Tools. IA: Jev (TypeSafe) clasifica; OpenAI `gpt-6-luna` redacta el asistente.

## Reglas no negociables

1. Aritmética, fechas, cantidades, cobertura y vencimientos: en código o SQL, nunca con un LLM. La cobertura ya la calcula la vista `v_replenishment`.
2. La IA solo propone. Aprobar, excepciones, reposición y despacho los hace un humano.
3. Secretos solo en `backend/.env`. Nunca en el frontend, el repo, logs, prompts ni capturas.
4. `stock_movements` es inmutable. Corregir = movimiento compensatorio.
5. Despacho y recepción: una transacción, idempotentes. Si algo falla, rollback total.
6. Toda salida de IA lleva `source: SIMULADO | API_REAL` y se guarda en `decision_logs`.
7. No modificar `db/01…06`. Un cambio de esquema = migración nueva `db/07+` + PR a `specs/000-contratos`. Toda función nueva termina con `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`.
8. Rol y puntos del usuario se leen de la base con su JWT. Nunca confiar en lo que mande el cliente.
9. Reservar reduce el disponible, no el físico. `delivered_unchecked` no aumenta stock. Registrar una compra no crea stock. Lotes vencidos no se reservan.
10. Mostrar siempre **DEMO FICTICIA**. No inventar métricas de ahorro reales.
11. **Reloj de demo:** toda fecha de negocio nueva = `demo_metadata.reference_at`, nunca `now()`. Las vistas ignoran lo posterior.
12. Frontend: los componentes no llaman a Supabase ni a `fetch` directo; usan los hooks de `frontend/src/data/`. La UI muestra códigos (`Q-001`, `PED-DEMO-001`, `INS-016`), nunca UUID.

## Comandos

- Backend: `cd backend && uv run pytest && uv run ruff check .`
- Funciones SQL: `node db/verificar_funciones.mjs` (PGlite local, sin Supabase)
- Frontend: `cd frontend && npx tsc --noEmit && npm run build`
- Base (local, sin Supabase): ver `README.md` → 61/61 pruebas.

Corre las pruebas de tu parte **antes de cada commit**.

## Git

- Rama por tarea: `front/jorge/…`, `front/bruno/…`, `back/david/…`, `ai/omar/…`.
- Nunca push a `main`. PR con la plantilla. Commits pequeños y en español.
- **Integrador: Jorge** (`@JorgeRevelo23`). Revisa y mergea los PRs a `main` con squash, después de correr sus pruebas. Cambios en `db/` o `specs/000-contratos/` necesitan además la revisión de Omar o David.
