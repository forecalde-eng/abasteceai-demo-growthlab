# AbasteceAI — Demo GrowthLab

Hackathon Expo Clean Ecuador 2026 · Reto 1: trazabilidad y abastecimiento de insumos de limpieza.
**DEMO FICTICIA:** todos los datos son inventados.

## Por dónde empezar

**Tus tickets:** [abasteceai-demo-growthlab/issues asignados a ti](https://github.com/forecalde-eng/abasteceai-demo-growthlab/issues?q=is%3Aopen+assignee%3A%40me) · [por fase](https://github.com/forecalde-eng/abasteceai-demo-growthlab/milestones). Cada tarea de tu hoja es un ticket con su criterio de "hecho cuando".

1. `00-handoffs/01_CONTEXTO_PROYECTO.md`: el negocio, el modelo de datos, el flujo y los roles.
2. `docs/04_SPEC_MAESTRA.md`: qué construimos y cómo se comprueba (historias, criterios, guion del pitch).
3. `docs/05_PLAN_IMPLEMENTACION.md`: decisiones técnicas, pruebas, cronograma y riesgos.
4. `docs/06_PLAN_EQUIPO.md` y `docs/equipo/<tu-nombre>.md`: quién hace qué, por fases.
5. `AGENTS.md`: reglas para tu IA. `CONTRIBUTING.md`: ramas y PRs.

## Estructura

```
00-handoffs/   documentos originales del equipo (contexto, plan SDD, arranque)
docs/          spec maestra y plan de implementación
db/            paquete DEMO-1.1: esquema, reglas/RLS, seed, consultas, documentos RAG
backend/       FastAPI (pendiente, T0.6)
frontend/      React + Vite (pendiente, T0.7)
```

## Verificar la base localmente

```bash
mkdir -p /tmp/abastece-verify && cp db/verificar_postgres.mjs db/verificar_07_integridad.mjs db/0[1-4]_*.sql db/07_integridad_preseed.sql /tmp/abastece-verify/
cd /tmp/abastece-verify && npm init -y && npm i @electric-sql/pglite@0.5.10 && node verificar_postgres.mjs && node verificar_07_integridad.mjs
```

Resultados esperados: `{"tests_passed":61}` y `{"tests_passed":29,"remote_calls":0}`.
