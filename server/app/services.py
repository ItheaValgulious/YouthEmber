from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from .config import Settings
from .db import connection_scope, row_to_dict, rows_to_dicts
from .security import (
    hash_password,
    hash_text,
    iso_after_days,
    issue_auth_token,
    random_id,
    utc_now,
    utc_now_iso,
    verify_password,
)


class AppError(Exception):
    def __init__(self, status_code: int, error_code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.message = message


@dataclass
class CurrentUser:
    id: str
    username: str


def provider_from_baseurl(baseurl: str) -> str:
    normalized = baseurl.strip().lower()
    host = urlparse(normalized).netloc or normalized
    if "openrouter" in host:
        return "openrouter"
    if "siliconflow" in host:
        return "siliconflow"
    if "openai" in host:
        return "openai"
    if host:
        return host
    return "custom"


def _parse_iso_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _ensure_username_available(connection: sqlite3.Connection, username: str) -> None:
    existing = connection.execute(
        "SELECT id FROM users WHERE username = ? LIMIT 1;",
        (username,),
    ).fetchone()
    if existing:
        raise AppError(409, "username_taken", "Username already exists.")


def _issue_login_for_user(
    connection: sqlite3.Connection,
    *,
    user_id: str,
    username: str,
    ttl_days: int,
) -> dict[str, Any]:
    raw_token, token_hash = issue_auth_token()
    now = utc_now_iso()
    expires_at = iso_after_days(ttl_days)
    connection.execute(
        """
        UPDATE users
        SET auth_token_hash = ?, auth_token_expires_at = ?, updated_at = ?, last_signin_at = ?
        WHERE id = ?;
        """,
        (token_hash, expires_at, now, now, user_id),
    )
    return {
        "user": {
            "id": user_id,
            "username": username,
        },
        "token": raw_token,
        "expires_at": expires_at,
    }


def _copy_current_task_to_stats(
    connection: sqlite3.Connection,
    task_row: dict[str, Any],
    *,
    state_override: str | None = None,
    updated_at: str | None = None,
    acked_at: str | None = None,
) -> None:
    state = state_override or str(task_row["state"])
    touched_at = updated_at or utc_now_iso()
    connection.execute(
        """
        INSERT INTO request_stats (
            request_id,
            user_id,
            client_request_id,
            state,
            model_id,
            model_name,
            provider,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            retry_count,
            error_code,
            created_at,
            started_at,
            finished_at,
            updated_at,
            acked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_id) DO UPDATE SET
            user_id = excluded.user_id,
            client_request_id = excluded.client_request_id,
            state = excluded.state,
            model_id = excluded.model_id,
            model_name = excluded.model_name,
            provider = excluded.provider,
            prompt_tokens = excluded.prompt_tokens,
            completion_tokens = excluded.completion_tokens,
            total_tokens = excluded.total_tokens,
            retry_count = excluded.retry_count,
            error_code = excluded.error_code,
            created_at = excluded.created_at,
            started_at = excluded.started_at,
            finished_at = excluded.finished_at,
            updated_at = excluded.updated_at,
            acked_at = excluded.acked_at;
        """,
        (
            task_row["id"],
            task_row["user_id"],
            task_row["client_request_id"],
            state,
            task_row["model_id"],
            task_row["model_name"],
            task_row["provider"],
            task_row["prompt_tokens"],
            task_row["completion_tokens"],
            task_row["total_tokens"],
            task_row["retry_count"],
            task_row["error_code"],
            task_row["created_at"],
            task_row["started_at"],
            task_row["finished_at"],
            touched_at,
            acked_at,
        ),
    )


def _fetch_current_task_by_id(
    connection: sqlite3.Connection,
    task_id: str,
) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT *
        FROM current_requests
        WHERE id = ?
        LIMIT 1;
        """,
        (task_id,),
    ).fetchone()
    return row_to_dict(row)


def signup(settings: Settings, username: str, password: str) -> dict[str, Any]:
    username = username.strip()
    if len(username) < 3:
        raise AppError(400, "username_invalid", "Username must be at least 3 characters.")

    with connection_scope(settings) as connection:
        _ensure_username_available(connection, username)
        now = utc_now_iso()
        user_id = random_id("usr")
        connection.execute(
            """
            INSERT INTO users (
                id,
                username,
                password_hash,
                auth_token_hash,
                auth_token_expires_at,
                created_at,
                updated_at,
                last_signin_at
            ) VALUES (?, ?, ?, NULL, NULL, ?, ?, NULL);
            """,
            (
                user_id,
                username,
                hash_password(password),
                now,
                now,
            ),
        )
        payload = _issue_login_for_user(
            connection,
            user_id=user_id,
            username=username,
            ttl_days=settings.auth_token_ttl_days,
        )
        connection.commit()
        return payload


def signin(settings: Settings, username: str, password: str) -> dict[str, Any]:
    username = username.strip()
    with connection_scope(settings) as connection:
        row = connection.execute(
            """
            SELECT id, username, password_hash
            FROM users
            WHERE username = ?
            LIMIT 1;
            """,
            (username,),
        ).fetchone()
        if row is None or not verify_password(password, row["password_hash"]):
            raise AppError(401, "auth_invalid", "Invalid username or password.")

        payload = _issue_login_for_user(
            connection,
            user_id=row["id"],
            username=row["username"],
            ttl_days=settings.auth_token_ttl_days,
        )
        connection.commit()
        return payload


def get_current_user(settings: Settings, raw_token: str) -> CurrentUser:
    token_hash = hash_text(raw_token)
    with connection_scope(settings) as connection:
        row = connection.execute(
            """
            SELECT id, username, auth_token_expires_at
            FROM users
            WHERE auth_token_hash = ?
            LIMIT 1;
            """,
            (token_hash,),
        ).fetchone()

    if row is None or not row["auth_token_expires_at"]:
        raise AppError(401, "auth_invalid", "Invalid auth token.")

    if _parse_iso_datetime(row["auth_token_expires_at"]) <= utc_now():
        raise AppError(401, "auth_expired", "Auth token expired.")

    return CurrentUser(id=row["id"], username=row["username"])


def signout(settings: Settings, user_id: str) -> None:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        connection.execute(
            """
            UPDATE users
            SET auth_token_hash = NULL, auth_token_expires_at = NULL, updated_at = ?
            WHERE id = ?;
            """,
            (now, user_id),
        )
        connection.commit()


def list_models(settings: Settings) -> list[dict[str, Any]]:
    with connection_scope(settings) as connection:
        rows = connection.execute(
            """
            SELECT id, name
            FROM models
            ORDER BY name COLLATE NOCASE ASC, id ASC;
            """
        ).fetchall()
    return rows_to_dicts(rows)


def create_task(
    settings: Settings,
    *,
    user_id: str,
    client_request_id: str,
    model_id: str,
    request_body: dict[str, Any],
) -> dict[str, Any]:
    now = utc_now_iso()
    request_body_text = json.dumps(request_body, ensure_ascii=False)

    with connection_scope(settings) as connection:
        current_row = connection.execute(
            """
            SELECT *
            FROM current_requests
            WHERE user_id = ? AND client_request_id = ?
            LIMIT 1;
            """,
            (user_id, client_request_id),
        ).fetchone()
        if current_row is not None:
            return build_task_view(row_to_dict(current_row), include_response=True)

        stats_row = connection.execute(
            """
            SELECT *
            FROM request_stats
            WHERE user_id = ? AND client_request_id = ?
            LIMIT 1;
            """,
            (user_id, client_request_id),
        ).fetchone()
        if stats_row is not None:
            return build_task_view(row_to_dict(stats_row), include_response=False)

        model_row = connection.execute(
            """
            SELECT id, name, baseurl
            FROM models
            WHERE id = ?
            LIMIT 1;
            """,
            (model_id,),
        ).fetchone()
        if model_row is None:
            raise AppError(404, "model_not_found", "Model does not exist.")

        provider = provider_from_baseurl(model_row["baseurl"])
        task_id = random_id("task")
        connection.execute(
            """
            INSERT INTO current_requests (
                id,
                user_id,
                client_request_id,
                state,
                model_id,
                model_name,
                provider,
                request_body,
                ai_response,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                retry_count,
                error_code,
                error_message,
                created_at,
                started_at,
                finished_at,
                updated_at,
                acked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, ?, NULL, NULL, ?, NULL);
            """,
            (
                task_id,
                user_id,
                client_request_id,
                "queued",
                model_row["id"],
                model_row["name"],
                provider,
                request_body_text,
                now,
                now,
            ),
        )
        connection.commit()

    return {
        "id": task_id,
        "state": "queued",
        "client_request_id": client_request_id,
        "model_id": model_row["id"],
        "model_name": model_row["name"],
        "provider": provider,
        "retry_count": 0,
        "created_at": now,
        "updated_at": now,
    }


def get_task(settings: Settings, *, user_id: str, task_id: str) -> dict[str, Any]:
    with connection_scope(settings) as connection:
        current_row = connection.execute(
            """
            SELECT *
            FROM current_requests
            WHERE id = ? AND user_id = ?
            LIMIT 1;
            """,
            (task_id, user_id),
        ).fetchone()
        if current_row is not None:
            return build_task_view(row_to_dict(current_row), include_response=True)

        stats_row = connection.execute(
            """
            SELECT *
            FROM request_stats
            WHERE request_id = ? AND user_id = ?
            LIMIT 1;
            """,
            (task_id, user_id),
        ).fetchone()
        if stats_row is None:
            raise AppError(404, "task_not_found", "Task does not exist.")

        return build_task_view(row_to_dict(stats_row), include_response=False)


def ack_task(settings: Settings, *, user_id: str, task_id: str) -> dict[str, Any]:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        current_row = connection.execute(
            """
            SELECT *
            FROM current_requests
            WHERE id = ? AND user_id = ?
            LIMIT 1;
            """,
            (task_id, user_id),
        ).fetchone()

        if current_row is None:
            stats_row = connection.execute(
                """
                SELECT *
                FROM request_stats
                WHERE request_id = ? AND user_id = ?
                LIMIT 1;
                """,
                (task_id, user_id),
            ).fetchone()
            if stats_row is None:
                raise AppError(404, "task_not_found", "Task does not exist.")
            if stats_row["acked_at"]:
                return {"ok": True}
            raise AppError(409, "task_not_ackable", "Task is not ackable yet.")

        current_payload = row_to_dict(current_row)
        if current_payload is None:
            raise AppError(404, "task_not_found", "Task does not exist.")
        if current_payload["state"] not in {"succeeded", "failed"}:
            raise AppError(409, "task_not_ackable", "Task is not ackable yet.")

        next_state = (
            "acknowledged" if current_payload["state"] == "succeeded" else current_payload["state"]
        )
        _copy_current_task_to_stats(
            connection,
            current_payload,
            state_override=next_state,
            updated_at=now,
            acked_at=now,
        )
        connection.execute(
            "DELETE FROM current_requests WHERE id = ? AND user_id = ?;",
            (task_id, user_id),
        )
        connection.commit()
        return {"ok": True}


def requeue_running_tasks(settings: Settings) -> int:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        cursor = connection.execute(
            """
            UPDATE current_requests
            SET state = 'queued',
                started_at = NULL,
                finished_at = NULL,
                updated_at = ?,
                error_code = NULL,
                error_message = NULL
            WHERE state = 'running';
            """,
            (now,),
        )
        connection.commit()
        return int(cursor.rowcount or 0)


def claim_next_queued_task(settings: Settings) -> dict[str, Any] | None:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        connection.execute("BEGIN IMMEDIATE;")
        row = connection.execute(
            """
            SELECT id
            FROM current_requests
            WHERE state = 'queued'
            ORDER BY created_at ASC, id ASC
            LIMIT 1;
            """
        ).fetchone()
        if row is None:
            connection.commit()
            return None

        cursor = connection.execute(
            """
            UPDATE current_requests
            SET state = 'running',
                started_at = COALESCE(started_at, ?),
                updated_at = ?,
                error_code = NULL,
                error_message = NULL
            WHERE id = ? AND state = 'queued';
            """,
            (now, now, row["id"]),
        )
        if cursor.rowcount != 1:
            connection.commit()
            return None

        claimed = connection.execute(
            """
            SELECT *
            FROM current_requests
            WHERE id = ?
            LIMIT 1;
            """,
            (row["id"],),
        ).fetchone()
        connection.commit()
        return row_to_dict(claimed)


def get_model_for_task(settings: Settings, model_id: str) -> dict[str, Any]:
    with connection_scope(settings) as connection:
        row = connection.execute(
            """
            SELECT *
            FROM models
            WHERE id = ?
            LIMIT 1;
            """,
            (model_id,),
        ).fetchone()
    if row is None:
        raise AppError(404, "model_not_found", "Model does not exist.")
    payload = row_to_dict(row)
    if payload is None:
        raise AppError(404, "model_not_found", "Model does not exist.")
    return payload


def get_first_image_capable_model(settings: Settings) -> dict[str, Any] | None:
    with connection_scope(settings) as connection:
        row = connection.execute(
            """
            SELECT *
            FROM models
            WHERE dealing_img = 1
            ORDER BY id ASC
            LIMIT 1;
            """
        ).fetchone()
    return row_to_dict(row)


def get_max_model_timeout_seconds(settings: Settings) -> float:
    with connection_scope(settings) as connection:
        row = connection.execute(
            """
            SELECT MAX(COALESCE(timeout_seconds, ?)) AS max_timeout_seconds
            FROM models;
            """,
            (settings.upstream_timeout_seconds,),
        ).fetchone()

    if row is None:
        return float(settings.upstream_timeout_seconds)

    raw_value = row["max_timeout_seconds"]
    if isinstance(raw_value, (int, float)) and float(raw_value) > 0:
        return float(raw_value)

    return float(settings.upstream_timeout_seconds)


def mark_task_retrying(
    settings: Settings,
    *,
    task_id: str,
    retry_count: int,
    error_code: str,
    error_message: str,
) -> dict[str, Any]:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        connection.execute(
            """
            UPDATE current_requests
            SET state = 'running',
                retry_count = ?,
                error_code = ?,
                error_message = ?,
                finished_at = NULL,
                updated_at = ?
            WHERE id = ?;
            """,
            (retry_count, error_code, error_message, now, task_id),
        )
        current_row = _fetch_current_task_by_id(connection, task_id)
        if current_row is None:
            raise AppError(404, "task_not_found", "Task does not exist.")
        connection.commit()
        return current_row


def mark_task_succeeded(
    settings: Settings,
    *,
    task_id: str,
    ai_response: str,
    prompt_tokens: int | None,
    completion_tokens: int | None,
    total_tokens: int | None,
) -> dict[str, Any]:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        connection.execute(
            """
            UPDATE current_requests
            SET state = 'succeeded',
                ai_response = ?,
                prompt_tokens = ?,
                completion_tokens = ?,
                total_tokens = ?,
                error_code = NULL,
                error_message = NULL,
                finished_at = ?,
                updated_at = ?
            WHERE id = ?;
            """,
            (
                ai_response,
                prompt_tokens,
                completion_tokens,
                total_tokens,
                now,
                now,
                task_id,
            ),
        )
        current_row = _fetch_current_task_by_id(connection, task_id)
        if current_row is None:
            raise AppError(404, "task_not_found", "Task does not exist.")
        _copy_current_task_to_stats(connection, current_row, updated_at=now)
        connection.commit()
        return current_row


def mark_task_failed(
    settings: Settings,
    *,
    task_id: str,
    retry_count: int,
    error_code: str,
    error_message: str,
) -> dict[str, Any]:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        connection.execute(
            """
            UPDATE current_requests
            SET state = 'failed',
                retry_count = ?,
                error_code = ?,
                error_message = ?,
                finished_at = ?,
                updated_at = ?
            WHERE id = ?;
            """,
            (retry_count, error_code, error_message, now, now, task_id),
        )
        current_row = _fetch_current_task_by_id(connection, task_id)
        if current_row is None:
            raise AppError(404, "task_not_found", "Task does not exist.")
        _copy_current_task_to_stats(connection, current_row, updated_at=now)
        connection.commit()
        return current_row


def build_task_view(raw_row: dict[str, Any] | None, *, include_response: bool) -> dict[str, Any]:
    if raw_row is None:
        raise AppError(404, "task_not_found", "Task does not exist.")

    payload: dict[str, Any] = {
        "id": raw_row.get("id") or raw_row.get("request_id"),
        "state": raw_row.get("state"),
        "client_request_id": raw_row.get("client_request_id"),
        "model_id": raw_row.get("model_id"),
        "model_name": raw_row.get("model_name"),
        "provider": raw_row.get("provider"),
        "retry_count": raw_row.get("retry_count", 0) or 0,
        "error_code": raw_row.get("error_code"),
        "error_message": raw_row.get("error_message"),
        "created_at": raw_row.get("created_at"),
        "started_at": raw_row.get("started_at"),
        "finished_at": raw_row.get("finished_at"),
        "updated_at": raw_row.get("updated_at"),
        "acked_at": raw_row.get("acked_at"),
    }

    if include_response:
        payload["ai_response"] = raw_row.get("ai_response")

    prompt_tokens = raw_row.get("prompt_tokens")
    completion_tokens = raw_row.get("completion_tokens")
    total_tokens = raw_row.get("total_tokens")
    if prompt_tokens is not None or completion_tokens is not None or total_tokens is not None:
        payload["usage"] = {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        }

    return payload
