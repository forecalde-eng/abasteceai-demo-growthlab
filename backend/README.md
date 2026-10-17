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

## Pruebas contra Postgres real (opcional)

`uv run pytest` corre sin base de datos. Además hay `tests/test_integracion_db.py`, que prueba la API
contra las funciones SQL de `db/` en un Postgres de verdad. Se salta si no existe `TEST_DATABASE_URL`.
**Úsalo solo con una base desechable** (crea pedidos y vincula cuentas):

```sh
createdb abastece_test
psql -v ON_ERROR_STOP=1 -d abastece_test -f tests/bd_desechable_stub.sql   # roles y auth ficticios
for f in 01_esquema 02_reglas_y_accesos 07_integridad_preseed 03_datos_ficticios \
         08_proveedor_openai 09_fn_pedidos 11_fn_envios; do
  psql -v ON_ERROR_STOP=1 -d abastece_test -f ../db/$f.sql
done
export TEST_DATABASE_URL=postgresql://localhost/abastece_test
uv run pytest tests/test_integracion_db.py
```
