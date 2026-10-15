# Cómo trabajamos

Quién hace qué: `docs/06_PLAN_EQUIPO.md`. Tu lista de tareas: `docs/equipo/<tu-nombre>.md`. Reglas para tu IA: `AGENTS.md`.

## Reglas

- **Nadie sube directo a `main`.** Todo entra por pull request (PR).
- Una rama por tarea, con tu prefijo:

| Persona | Prefijo de rama | Ejemplo |
|---|---|---|
| Omar | `ai/omar/` | `ai/omar/auth-jwt` |
| David | `back/david/` | `back/david/dispatch` |
| Jorge | `front/jorge/` | `front/jorge/bandeja-admin` |
| Bruno | `front/bruno/` | `front/bruno/recepcion-qr` |

- Solo tocas las carpetas que son tuyas (`docs/06_PLAN_EQUIPO.md §2`). Para algo ajeno: PR pequeño avisando al dueño.
- **Secretos nunca en el repo.** `.env` está ignorado; las claves se pasan por el canal privado.

## Tickets

Cada tarea de `docs/equipo/<tu-nombre>.md` es un issue asignado a ti, con etiqueta de persona y hito de fase: [mis tickets](https://github.com/forecalde-eng/abasteceai-demo-growthlab/issues?q=is%3Aopen+assignee%3A%40me) · [hitos](https://github.com/forecalde-eng/abasteceai-demo-growthlab/milestones). Trabaja en orden de fase y pon `Closes #N` en tu PR: el ticket se cierra solo al mergear.

## Flujo

```bash
git checkout main && git pull
git checkout -b front/bruno/recepcion-qr
# ... trabajar con tu IA, una tarea ...
git add -A && git commit -m "recepción: lector QR y conteo por ítem (B-2.5)"
git push -u origin front/bruno/recepcion-qr
gh pr create --base main --fill          # o desde la web
```

Mientras tu PR espera, o antes de seguir, trae lo último de `main`:

```bash
git fetch origin && git rebase origin/main
```

## Revisión

- Cada PR se revisa contra la spec, las invariantes I1–I12 y las pruebas, y que no tenga secretos.
- Si está bien → **squash merge** a `main` y se borra la rama. Si no → comentarios en el PR.
- PRs pequeños (idealmente ≤ 300 líneas): ninguno debería esperar más de 1 hora.
