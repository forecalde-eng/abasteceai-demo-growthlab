# backend/ · FastAPI delgado (DEMO FICTICIA)

Valida JWT, rol y punto, y llama a **una** función SQL `abastece.fn_*` (contrato: `specs/000-contratos/`).

```sh
cd backend
cp .env.example .env      # completa DATABASE_URL (Session pooler, puerto 5432); nunca lo subas
uv sync
uv run pytest && uv run ruff check .
uv run uvicorn app.main:app --reload     # http://localhost:8000/health
```

- `app/db.py` · `call_fn("fn_x", *args)`: único punto de acceso a la base (pool ≤ 5).
- `app/errors.py` · los `P0403/P0404/P0409/P0422` de las funciones salen como el `Error` del contrato.
