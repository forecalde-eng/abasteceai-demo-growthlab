from contextlib import asynccontextmanager
from typing import Annotated, Any

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import admin
from app.admin import router as admin_router
from app.asistente import router as asistente_router
from app.auth import Me, get_me
from app.config import get_settings
from app.db import cerrar_pool
from app.envios import router as envios_router
from app.errors import ApiError
from app.orders import router as orders_router
from app.routes import router as routes_router


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

    @app.middleware("http")
    async def mantenimiento(request: Request, call_next):
        # Durante el reset ninguna otra escritura (todas son POST) puede colarse entre sus pasos.
        if request.method != "POST" or request.url.path == "/admin/reset-demo":
            return await call_next(request)
        if not admin.admitir_escritura():
            error = ApiError(
                409, "CONFLICT", "Reinicio de la demo en curso; intenta en unos segundos."
            )
            return JSONResponse(error.body(), status_code=409)
        try:
            return await call_next(request)
        finally:
            admin.terminar_escritura()

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
    app.include_router(asistente_router)
    app.include_router(envios_router)
    app.include_router(routes_router)
    app.include_router(admin_router)

    @app.get("/me", operation_id="getMe", tags=["sistema"])
    def me(actual: Annotated[Me, Depends(get_me)]) -> dict[str, Any]:
        return actual.as_dict()

    return app


app = create_app()
