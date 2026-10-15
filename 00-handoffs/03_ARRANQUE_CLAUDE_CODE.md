# AbasteceAI — Arranque con Claude Code

> Este archivo es para el líder (A). Contiene: cómo preparar la carpeta, el prompt para pegar en Claude Code, y el contenido de `AGENTS.md`.

---

## 1. Preparar la carpeta local

```
abasteceai/
├── docs/
│   ├── 01_CONTEXTO_PROYECTO.md
│   ├── 02_PLAN_EQUIPO_SDD.md
│   └── 03_ARRANQUE_CLAUDE_CODE.md
└── db/          ← descomprimir aquí TODO el contenido de abasteceai_demo/ del zip
```

```bash
mkdir abasteceai && cd abasteceai
mkdir docs db
# copiar los 3 .md a docs/
# descomprimir el zip y mover el contenido de abasteceai_demo/ a db/
git init
claude
```

Requisitos: Node 20+, Python 3.11+, `uv` (`curl -LsSf https://astral.sh/uv/install.sh | sh`), `gh` autenticado.

---

## 2. Prompt para pegar en Claude Code

Pégalo tal cual en la primera sesión:

```text
Eres el agente de desarrollo del equipo AbasteceAI (4 personas, hackathon 16–17 oct 2026).
Lee completos, en este orden: docs/01_CONTEXTO_PROYECTO.md, docs/02_PLAN_EQUIPO_SDD.md,
docs/03_ARRANQUE_CLAUDE_CODE.md y db/README_plan.md. No escribas código de features todavía.

Trabaja paso a paso y espera mi confirmación antes de pasar al siguiente:

PASO 1 — Spec Kit
  Ejecuta: uvx --from git+https://github.com/github/spec-kit.git specify init . --ai claude
  Muéstrame qué archivos creó.

PASO 2 — Constitución
  Ejecuta /speckit.constitution usando las 10 reglas de la sección 4 (Fase 0)
  de docs/02_PLAN_EQUIPO_SDD.md. No agregues reglas que no estén ahí.

PASO 3 — Archivos de agente
  Crea AGENTS.md con el contenido de la sección 3 de docs/03_ARRANQUE_CLAUDE_CODE.md
  y CLAUDE.md con una sola línea: @AGENTS.md

PASO 4 — Contratos congelados (specs/000-contratos/)
  - openapi.yaml: los 11 endpoints de la sección 6 de docs/01_CONTEXTO_PROYECTO.md.
    Usa los nombres de tablas y columnas reales de db/01_esquema.sql.
    Incluye header Idempotency-Key en POST de escritura y el campo source: SIMULADO|API_REAL
    en respuestas con IA.
  - estados.md: máquina de estados del pedido y qué rol puede hacer cada transición.
  - roles.md: tabla de permisos de los 7 roles.
  Si algo del contrato no cuadra con el SQL, dímelo antes de inventar.

PASO 5 — Esqueleto del repo
  Estructura exacta de la sección 3 de docs/02_PLAN_EQUIPO_SDD.md:
  - backend/: FastAPI mínimo, GET /health, routers vacíos (orders, warehouse, routes, ai, auth),
    pyproject con uv, ruff, pytest, .env.example copiado de db/config_backend.env.example.
  - frontend/: Vite + React + TS, cliente Supabase con db: { schema: 'abastece' },
    .env.example copiado de db/config_frontend.env.example, banner "DEMO FICTICIA".
  - .gitignore (incluye .env, node_modules, .venv, __pycache__).
  - README.md con cómo levantar backend y frontend.
  Nada de lógica de negocio todavía.

PASO 6 — GitHub
  - .github/CODEOWNERS por carpeta (te daré los usuarios; usa placeholders @A @B @C @D si no los tengo).
  - .github/pull_request_template.md (spec relacionada, caso del pitch, cómo probar, ¿toca contrato?).
  - .github/workflows/ci.yml: ruff + pytest (backend), tsc --noEmit + vite build (frontend),
    node db/verificar_postgres.mjs (db).
  - Commit inicial. Pregúntame antes de crear el repo remoto con gh y antes de hacer push.

PASO 7 — Specs de feature
  Para cada feature (001-pedidos, 002-bodega-recepcion, 003-logistica, 004-ia) prepara solo
  la rama y una nota en specs/00X/README.md con: dueño, alcance MUST/SHOULD, endpoints del
  contrato que le tocan y casos del pitch que debe demostrar. No ejecutes /speckit.specify:
  eso lo hace cada dueño en su máquina.

Reglas durante todo el trabajo: respeta AGENTS.md, no inventes datos ni métricas,
no toques db/*.sql, y si una decisión no está en los docs, pregúntame.
```

---

## 3. Contenido de `AGENTS.md`

```markdown
# AbasteceAI — Reglas para agentes de IA

Proyecto de hackathon (Expo Clean Ecuador 2026, Reto 1). Logística de abastecimiento de insumos de limpieza
desde una bodega central a puntos de servicio. **Todos los datos son ficticios.**

## Antes de trabajar
1. Lee `docs/01_CONTEXTO_PROYECTO.md` (negocio, modelo de datos, flujo, roles, contratos).
2. Lee la spec de tu feature en `specs/00X-*/` (spec.md, plan.md, tasks.md).
3. El contrato está en `specs/000-contratos/`. No lo cambies: si hace falta, avisa y propone un PR aparte.

## Stack
- Backend: Python 3.11 + FastAPI (`backend/`), gestionado con `uv`. Tests con `pytest`, lint con `ruff`.
- Frontend: React + TypeScript + Vite (`frontend/`). Mapa con Leaflet.
- Datos: Supabase (PostgreSQL + Auth + RLS), esquema `abastece`. SQL en `db/` es fuente de verdad.
- Rutas: OR-Tools. IA: Jev (TypeSafe) para clasificar, OpenAI `gpt-6-luna` para explicar.

## Reglas no negociables
1. Aritmética, fechas, cantidades, cobertura y vencimientos: siempre en código, nunca con un LLM.
2. La IA solo propone. Aprobar pedidos, excepciones, reposición y despacho lo hace un humano.
3. Secretos solo en `backend/.env`. Nunca en el frontend, el repo, logs ni prompts.
4. `stock_movements` es inmutable. Corregir = nuevo movimiento compensatorio.
5. Despacho y recepción: una transacción, con `Idempotency-Key`. Si algo falla, rollback total.
6. Toda salida de IA lleva `source: SIMULADO | API_REAL` y se guarda en `decision_logs`.
7. No modificar `db/*.sql`. Un cambio de esquema = nueva migración + PR a `specs/000-contratos`.
8. El rol y los puntos del usuario se leen de la base con su JWT. Nunca confiar en el cliente.
9. Reservar reduce el disponible, no el stock físico. `delivered_unchecked` no aumenta stock del punto.
   Registrar una compra no crea stock. Lotes vencidos no se reservan.
10. Mostrar siempre la etiqueta DEMO FICTICIA. No inventar métricas de ahorro reales.

## Cómo trabajar
- Solo toca las carpetas de tu feature. `backend/app/main.py`, `frontend/src/App.tsx`,
  `specs/000-contratos/` y `db/` son del líder.
- Cambios pequeños, un PR por tarea de `tasks.md`.
- Cada endpoint de escritura valida: JWT, rol, punto asignado, estado previo, idempotencia.
- Cada feature tiene al menos un test que reproduce su caso del guion del pitch.
- Comandos: `cd backend && uv run pytest && uv run ruff check .` · `cd frontend && npx tsc --noEmit && npm run build`
- Si algo no está en los docs, pregunta antes de inventar.
```

---

## 4. Lo que hace cada miembro después del push

```bash
git clone <repo> && cd abasteceai
git checkout 00X-<feature>
cp backend/.env.example backend/.env      # pedir valores al líder por canal privado
cp frontend/.env.example frontend/.env
claude
```

Y en su agente:

```text
Lee AGENTS.md, docs/01_CONTEXTO_PROYECTO.md y specs/00X-<feature>/README.md.
Luego ejecuta /speckit.specify para mi feature, usando como criterios de aceptación
los casos del pitch del README. Después /speckit.clarify, /speckit.plan y /speckit.tasks.
Abre un PR solo con la spec antes de implementar.
```

Cuando la spec esté aprobada: `/speckit.implement`, tarea por tarea.
