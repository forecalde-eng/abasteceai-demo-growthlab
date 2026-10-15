# AbasteceAI — Demo GrowthLab

Hackathon Expo Clean Ecuador 2026 · Reto 1: trazabilidad y abastecimiento de insumos de limpieza.
**DEMO FICTICIA:** todos los datos son inventados.

## Por dónde empezar

1. `00-handoffs/01_CONTEXTO_PROYECTO.md`: el negocio, el modelo de datos, el flujo y los roles.
2. `docs/04_SPEC_MAESTRA.md`: qué construimos y cómo se comprueba (historias, criterios, guion del pitch).
3. `docs/05_PLAN_IMPLEMENTACION.md`: tareas por persona, cronograma y riesgos.
4. `CONTRIBUTING.md`: cómo trabajamos con ramas y PRs.

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
mkdir -p /tmp/abastece-verify && cp db/verificar_postgres.mjs db/0[1-4]_*.sql /tmp/abastece-verify/
cd /tmp/abastece-verify && npm init -y && npm i @electric-sql/pglite && node verificar_postgres.mjs
```

Resultado esperado: `{"tests_passed":61}`.
