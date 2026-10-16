from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import Me, get_me
from app.config import get_settings
from app.db import cerrar_pool
from app.errors import ApiError
from app.orders import router as orders_router


@asynccontextmanager
async def lifespan(_: FastAPI):
    yield
    cerrar_pool()


def create_app() -> FastAPI:
    app = FastAPI(title="AbasteceAI API (DEMO FICTICIA)", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_settings().cors_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
    )

    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError) -> JSONResponse:
        return JSONResponse(exc.body(), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validacion(_: Request, exc: RequestValidationError) -> JSONResponse:
        # El contrato fija un solo formato de error; FastAPI traería otro por defecto.
        campos = [
            {"field": ".".join(str(p) for p in e["loc"]), "msg": e["msg"]} for e in exc.errors()
        ]
        error = ApiError(422, "VALIDATION", "Datos inválidos.", {"errors": campos})
        return JSONResponse(error.body(), status_code=422)

    @app.get("/health", operation_id="getHealth", tags=["sistema"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(orders_router)

    @app.get("/me", operation_id="getMe", tags=["sistema"])
    def me(actual: Annotated[Me, Depends(get_me)]) -> dict[str, Any]:
        return actual.as_dict()

    return app


app = create_app()
