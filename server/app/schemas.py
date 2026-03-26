from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class ApiUser(BaseModel):
    id: str
    username: str


class AuthRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8, max_length=256)


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=256)
    new_password: str = Field(min_length=8, max_length=256)


class AuthResponse(BaseModel):
    user: ApiUser
    token: str
    expires_at: str


class OkResponse(BaseModel):
    ok: bool = True


class PublicModel(BaseModel):
    id: str
    name: str


class ModelsResponse(BaseModel):
    items: list[PublicModel]


class TaskCreateRequest(BaseModel):
    client_request_id: str = Field(min_length=1, max_length=255)
    model_id: str = Field(min_length=1, max_length=255)
    request_body: dict[str, Any]


class TaskUsage(BaseModel):
    prompt_tokens: int | None = None
    completion_tokens: int | None = None
    total_tokens: int | None = None


class TaskView(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    state: str
    client_request_id: str | None = None
    model_id: str
    model_name: str | None = None
    provider: str | None = None
    retry_count: int = 0
    ai_response: str | None = None
    usage: TaskUsage | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    updated_at: str | None = None
    acked_at: str | None = None


class TaskEnvelope(BaseModel):
    task: TaskView
