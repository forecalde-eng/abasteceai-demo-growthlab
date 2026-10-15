# Cómo trabajamos

## Reglas

- **Nadie sube directo a `main`.** Todo entra por pull request (PR).
- Cada feature tiene su rama y su dueño:

| Rama | Dueño | Alcance |
|---|---|---|
| `001-pedidos` | A (Fausto) | Login, layout, pedidos, análisis, decisión admin |
| `002-bodega-recepcion` | B | Preparar, despachar, entregar, recibir (QR) |
| `003-logistica` | C | Rutas OR-Tools, confirmar plan (crea envíos), courier |
| `004-ia` | D | Jev, asistente, tablero de cobertura |

- Subtareas en ramas cortas: `002-bodega-recepcion/dispatch`.
- Solo A toca `backend/app/main.py`, `frontend/src/App.tsx`, `specs/000-contratos/` y `db/`. Si necesitas un cambio ahí, pídelo con un PR pequeño.
- **Secretos nunca en el repo.** `.env` está ignorado; las claves se pasan por canal privado.

## Flujo

```bash
git checkout main && git pull
git checkout -b 002-bodega-recepcion        # o tu rama
# ... trabajar ...
git add -A && git commit -m "bodega: preparar por lote con FEFO"
git push -u origin 002-bodega-recepcion
gh pr create --base main --fill             # o desde la web
```

Antes de seguir trabajando, trae lo último de `main`:

```bash
git fetch origin && git rebase origin/main
```

## Revisión

- Cada PR se revisa antes de entrar a `main`: que cumpla la spec (`docs/04_SPEC_MAESTRA.md`), que respete las invariantes I1–I12, que pasen las pruebas y que no haya secretos.
- Si está bien → **squash merge** a `main`. Si no → comentarios en el PR con lo que hay que corregir.
- PRs pequeños (idealmente ≤ 300 líneas): se revisan rápido.
