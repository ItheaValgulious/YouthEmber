from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings, load_settings
from .db import init_db, seed_models_if_needed
from .schemas import (
    AuthRequest,
    AuthResponse,
    ChangePasswordRequest,
    ModelsResponse,
    OkResponse,
    TaskCreateRequest,
    TaskEnvelope,
)
from .services import (
    AppError,
    CurrentUser,
    ack_task,
    change_password,
    create_task,
    get_current_user,
    get_task,
    list_models,
    signin,
    signout,
    signup,
)
from .worker import TaskWorker


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)

bearer_scheme = HTTPBearer(auto_error=False)


def create_app() -> FastAPI:
    settings = load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        init_db(settings)
        seed_models_if_needed(settings)

        worker = TaskWorker(settings)
        worker.start()

        app.state.settings = settings
        app.state.worker = worker
        try:
            yield
        finally:
            worker.stop()

    app = FastAPI(title="Ashdairy Server", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_allowed_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.error_code,
                    "message": exc.message,
                }
            },
        )

    @app.get("/health")
    async def health() -> dict[str, bool]:
        return {"ok": True}

    @app.post("/api/v1/auth/signup", response_model=AuthResponse)
    async def signup_route(payload: AuthRequest, app_settings: Settings = Depends(get_settings)) -> dict:
        return signup(app_settings, payload.username, payload.password)

    @app.post("/api/v1/auth/signin", response_model=AuthResponse)
    async def signin_route(payload: AuthRequest, app_settings: Settings = Depends(get_settings)) -> dict:
        return signin(app_settings, payload.username, payload.password)

    @app.post("/api/v1/auth/change-password", response_model=AuthResponse)
    async def change_password_route(
        payload: ChangePasswordRequest,
        user: CurrentUser = Depends(get_authenticated_user),
        app_settings: Settings = Depends(get_settings),
    ) -> dict:
        return change_password(
            app_settings,
            user_id=user.id,
            old_password=payload.old_password,
            new_password=payload.new_password,
        )

    @app.post("/api/v1/auth/signout", response_model=OkResponse)
    async def signout_route(
        user: CurrentUser = Depends(get_authenticated_user),
        app_settings: Settings = Depends(get_settings),
    ) -> dict:
        signout(app_settings, user.id)
        return {"ok": True}

    @app.get("/api/v1/models", response_model=ModelsResponse)
    async def models_route(
        _user: CurrentUser = Depends(get_authenticated_user),
        app_settings: Settings = Depends(get_settings),
    ) -> dict:
        return {"items": list_models(app_settings)}

    @app.post("/api/v1/ai/tasks", response_model=TaskEnvelope)
    async def create_task_route(
        payload: TaskCreateRequest,
        user: CurrentUser = Depends(get_authenticated_user),
        app_settings: Settings = Depends(get_settings),
    ) -> dict:
        task = create_task(
            app_settings,
            user_id=user.id,
            client_request_id=payload.client_request_id,
            model_id=payload.model_id,
            request_body=payload.request_body,
        )
        return {"task": task}

    @app.get("/api/v1/ai/tasks/{task_id}", response_model=TaskEnvelope)
    async def get_task_route(
        task_id: str,
        user: CurrentUser = Depends(get_authenticated_user),
        app_settings: Settings = Depends(get_settings),
    ) -> dict:
        return {"task": get_task(app_settings, user_id=user.id, task_id=task_id)}

    @app.post("/api/v1/ai/tasks/{task_id}/ack", response_model=OkResponse)
    async def ack_task_route(
        task_id: str,
        user: CurrentUser = Depends(get_authenticated_user),
        app_settings: Settings = Depends(get_settings),
    ) -> dict:
        return ack_task(app_settings, user_id=user.id, task_id=task_id)

    return app


def get_settings(request: Request) -> Settings:
    settings = getattr(request.app.state, "settings", None)
    if settings is None:
        raise AppError(500, "worker_internal_error", "Application settings not initialized.")
    return settings


def get_authenticated_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    if credentials is None or credentials.scheme.lower() != "bearer" or not credentials.credentials:
        raise AppError(401, "auth_invalid", "Missing bearer token.")

    settings = get_settings(request)
    return get_current_user(settings, credentials.credentials)


app = create_app()
