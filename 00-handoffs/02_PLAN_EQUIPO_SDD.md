# AbasteceAI — Plan del equipo con Spec-Driven Development

> 4 personas · 1 repo centralizado en GitHub · cada uno con su agente de IA · hackathon 16–17 oct 2026.
> Contexto de negocio y técnico: ver `01_CONTEXTO_PROYECTO.md`.

---

## 1. Alcance recortado (no negociable)

El plan original tiene 8 pantallas + Jev + RAG + ORS + OR-Tools. En ~2 días con 4 personas no entra todo. Se construye **el guion del pitch**, nada más.

| Prioridad | Qué |
|---|---|
| **MUST** | Login con 7 roles · pedido con duplicado (PED-001/025) y omisión (PED-002) · aprobación admin · bodega prepara y despacha (transacción idempotente) · recepción QR 10 enviados / 8 recibidos (PED-005) · entregado sin conteo (PED-004) · tablero de cobertura |
| **SHOULD** | Jev en modo SIMULADO con switch `--live` · asistente con búsqueda textual (sin embeddings) · OR-Tools con 10 puntos de Quito usando matriz haversine |
| **COULD** | ORS real · pgvector + embeddings · simulador demanda +20% / vehículo fuera · compras |
| **WON'T** | Deploy público · matriz de 700 puntos · API real de courier · modelos predictivos |

Regla: nadie empieza un COULD hasta que todos los MUST funcionen integrados en `main`.

---

## 2. Reparto vertical

Cada persona es dueña de **una feature completa** (spec + backend + frontend). Así casi no hay conflictos de merge.

| Persona | Spec | Backend (`backend/app/routers/`) | Frontend (`frontend/src/features/`) | Casos del pitch |
|---|---|---|---|---|
| **A — Líder / integrador** | `000-contratos`, `001-pedidos` | `auth.py` (JWT → rol y puntos desde DB), `orders.py`: `POST /orders`, `/orders/{id}/analyze` (reglas: duplicado, kit, unidades), `/orders/{id}/approve` | Shell, login, layout por rol, `pedidos/` (crear, lista, revisión admin) | PED-001/025, PED-002 |
| **B** | `002-bodega-recepcion` | `warehouse.py`: `/orders/{id}/prepare`, `/shipments/{id}/dispatch`, `/shipments/{id}/delivered`, `/shipments/{id}/receipt` | `bodega/` (preparación por lote, reservas, diferencias), `recepcion/` (móvil, QR, conteo) | PED-003, 004, 005, INS-005 |
| **C** | `003-logistica` | `routes.py`: `/routes/plan` (OR-Tools), registro de guía courier | `logistica/` (mapa Leaflet, propuesta, no asignados con motivo) | Ruta Quito, courier retrasado |
| **D** | `004-ia` | `ai.py`: Jev dentro de `/analyze` (hook que A expone), `/assistant` (RAG textual + funciones permitidas), cobertura | `ia/` (chat con fuentes), `tablero/` (cobertura, reposición) | Propuesta Jev, documento DEMO-1.1 |

**Dependencia clave:** A expone en `/analyze` un punto de extensión `classify_notes(order) -> Proposal` que devuelve un resultado SIMULADO. D lo reemplaza por Jev real sin tocar el resto.

**Recomendación:** el líder (A) debe ser quien mejor maneje git. D encaja con quien tenga más experiencia en IA/automatización.

---

## 3. Estructura del repo

```
abasteceai/
├── AGENTS.md                    # reglas para cualquier IA (Codex, Copilot, OpenCode…)
├── CLAUDE.md                    # contiene solo:  @AGENTS.md
├── README.md                    # cómo levantar todo en 5 comandos
├── .specify/memory/constitution.md
├── docs/
│   ├── 01_CONTEXTO_PROYECTO.md  # este kit
│   └── 02_PLAN_EQUIPO_SDD.md
├── specs/
│   ├── 000-contratos/           # openapi.yaml, estados.md, roles.md  ← CONGELADO tras H1
│   ├── 001-pedidos/             # spec.md, plan.md, tasks.md
│   ├── 002-bodega-recepcion/
│   ├── 003-logistica/
│   └── 004-ia/
├── db/                          # 01…06 .sql, documentos_ficticios/, verificar_postgres.mjs  (sin tocar)
├── backend/
│   ├── app/main.py              # solo A registra routers
│   ├── app/routers/             # orders.py · warehouse.py · routes.py · ai.py · auth.py
│   ├── tests/
│   └── .env.example
├── frontend/
│   ├── src/App.tsx              # solo A registra rutas
│   ├── src/features/            # pedidos/ · bodega/ · recepcion/ · logistica/ · ia/ · tablero/
│   ├── src/mocks/               # respuestas generadas desde openapi.yaml
│   └── .env.example
└── .github/
    ├── CODEOWNERS
    ├── pull_request_template.md
    └── workflows/ci.yml
```

---

## 4. Flujo SDD con Spec Kit

Spec Kit (`github/spec-kit`) funciona con Claude Code, Codex, Copilot y otros. Inicialización (una sola vez, la hace A):

```bash
uvx --from git+https://github.com/github/spec-kit.git specify init abasteceai --ai claude
```

Si algún miembro usa otro agente, puede inicializar los comandos de su herramienta en el mismo repo; las specs son las mismas.

### Fase 0 — Constitución (A, 30 min, los 4 aprueban)

`/speckit.constitution` con estas reglas (sacadas del brief):

1. La aritmética, fechas, cantidades, cobertura y vencimientos se calculan en código, nunca con un LLM.
2. La IA solo propone; toda aprobación de pedido, excepción, reposición y despacho es humana.
3. Claves secretas solo en backend. Nada de secretos en el repo ni en el frontend.
4. El historial de inventario no se edita ni se borra; se compensa con nuevos movimientos.
5. Despacho y recepción son transaccionales e idempotentes.
6. Toda salida de IA lleva etiqueta `SIMULADO` o `API_REAL` y queda en `decision_logs`.
7. El esquema SQL de `db/` es el contrato. Cambiarlo exige una migración nueva y PR a `specs/000-contratos`.
8. El backend obtiene rol y puntos de la base, nunca del cliente.
9. Todos los datos se muestran como DEMO FICTICIA.
10. Cada feature termina con una comprobación funcional ligada a un caso del guion del pitch.

### Fase 1 — Contratos congelados (H0–H1)

A genera `specs/000-contratos/`:
- `openapi.yaml` a partir de la tabla de endpoints (sección 6 del contexto).
- `estados.md` con la máquina de estados del pedido.
- `roles.md` con la tabla de permisos.

Tras el merge, el contrato queda **congelado**. El frontend trabaja con mocks del contrato y el backend lo implementa en paralelo.

### Fase 2 — Specs por feature (cada uno, en su rama)

```
/speckit.specify   → spec.md   (qué y por qué, historias de usuario, criterios de aceptación = casos del pitch)
/speckit.clarify   → resuelve ambigüedades
/speckit.plan      → plan.md   (cómo, usando el stack decidido y el contrato)
/speckit.tasks     → tasks.md  (tareas pequeñas y verificables)
```

Primer PR de cada uno = **solo la spec**. Otro miembro la revisa en ≤15 min.

### Fase 3 — Implementación

```
/speckit.implement   → tarea por tarea, PR pequeños (≤ 300 líneas idealmente)
```

### Fase 4 — Integración

Cada 3 horas todos hacen merge a `main` y se corre el guion del pitch completo de punta a punta.

---

## 5. Reglas de GitHub

- **`main` protegida:** 1 review obligatorio + CI en verde. Squash merge.
- **Ramas** = nombre de la spec: `001-pedidos`, `002-bodega-recepcion`, `003-logistica`, `004-ia`. Ramas cortas para subtareas: `001-pedidos/approve`.
- **Rebase** sobre `main` al menos cada hora.
- **CODEOWNERS** por carpeta (`specs/00X`, `backend/app/routers/X.py`, `frontend/src/features/X`).
- **Archivos compartidos** (`backend/app/main.py`, `frontend/src/App.tsx`, `specs/000-contratos/`, `db/`): solo los toca A. Los demás piden el cambio por PR pequeño.
- **Cambio de contrato:** primero PR a `specs/000-contratos`, aprobado por A; luego el código.
- **Secretos:** `.env` en `.gitignore`. Se comparten por canal privado, nunca en el repo, issues ni chats con IA.
- **Supabase:** un solo proyecto compartido. Todos leen con la publishable key; la secret key solo en el `.env` local del backend.
- **CI mínimo** (`.github/workflows/ci.yml`):
  - backend: `ruff check` + `pytest`
  - frontend: `tsc --noEmit` + `vite build`
  - db: `node db/verificar_postgres.mjs`
- **Plantilla de PR:** spec relacionada · caso del pitch que demuestra · cómo probarlo · ¿toca contrato? (sí/no).

---

## 6. Cronograma

### Hoy y jueves 15 (preparación)

> ⚠️ Revisar las reglas del evento: muchos hackathons exigen que el código se escriba durante el evento. Specs, cuentas y entorno normalmente sí se permiten antes.

- [ ] A crea el repo, invita a los 4, protege `main`, sube `docs/` y `db/`.
- [ ] A inicializa Spec Kit y redacta la constitución; los 4 la aprueban.
- [ ] Crear proyecto Supabase, cargar SQL 01–03, crear 7 usuarios Auth y vincular UUID.
- [ ] Cada uno instala su entorno: Node 20+, Python 3.11+, `uv`, su agente de IA.
- [ ] Crear cuentas: OpenAI, TypeSafe (Jev), HeiGIT (ORS). Cargar límite de gasto.
- [ ] Cada uno lee `01_CONTEXTO_PROYECTO.md` completo.

### Viernes 16

| Hora | Qué |
|---|---|
| H0–H1 | Sync de 15 min. A congela contratos y hace scaffold (FastAPI + Vite + Supabase client + login) |
| H1–H3 | Cada uno: specify → clarify → plan → tasks. PR de specs y revisión cruzada |
| H3–H6 | Implementación. **Integración #1** al final |
| H6–H9 | Implementación. **Integración #2** |
| H9–fin | Implementación. **Integración #3**: todos los MUST deben correr |

### Sábado 17

| Hora | Qué |
|---|---|
| Mañana | SHOULD (Jev live, asistente, OR-Tools). Arreglos de integración |
| −4 h del pitch | **Congelar features.** Solo bugs |
| −3 h | Preparar caso precargado de respaldo (etiquetado SIMULADO) por si falla internet |
| −2 h | Ensayar el pitch 2 veces de punta a punta |

---

## 7. Definición de "hecho" por feature

- La spec tiene criterios de aceptación ligados a un caso del pitch.
- El endpoint valida rol, punto, estado previo e idempotencia.
- Hay al menos un test que reproduce el caso del pitch.
- La pantalla muestra la etiqueta DEMO FICTICIA y, si hay IA, SIMULADO/API_REAL.
- Merge en `main` con CI verde y funcionando en la integración.
