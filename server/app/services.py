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


@dataclass
class UserQuotaSummary:
    id: str
    username: str
    quota_before: int
    quota_after: int


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


def _read_allowed_model_ids(settings: Settings) -> set[str] | None:
    seed_path = settings.models_seed_path
    if not seed_path.exists():
        return None

    payload = json.loads(seed_path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        return None

    allowed_model_ids: set[str] = set()
    for item in payload:
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id", "")).strip()
        if model_id:
            allowed_model_ids.add(model_id)

    return allowed_model_ids


def _build_model_id_filter(allowed_model_ids: set[str] | None) -> tuple[str, tuple[str, ...]]:
    if allowed_model_ids is None:
        return "", ()

    if not allowed_model_ids:
        return " AND 1 = 0", ()

    placeholders = ", ".join("?" for _ in allowed_model_ids)
    return f" AND id IN ({placeholders})", tuple(sorted(allowed_model_ids))


def _ensure_user_can_create_tasks(connection: sqlite3.Connection, user_id: str) -> None:
    row = connection.execute(
        """
        SELECT quota
        FROM users
        WHERE id = ?
        LIMIT 1;
        """,
        (user_id,),
    ).fetchone()
    if row is None:
        raise AppError(401, "auth_invalid", "User does not exist.")

    quota = row["quota"]
    if not isinstance(quota, int):
        quota = int(quota or 0)

    if quota <= 0:
        raise AppError(403, "quota_exhausted", "User quota is exhausted.")


def _normalize_positive_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        normalized = int(value)
    else:
        try:
            normalized = int(str(value).strip())
        except (TypeError, ValueError):
            return None

    return normalized if normalized > 0 else None


def _calculate_quota_cost(
    *,
    prompt_tokens: Any,
    completion_tokens: Any,
    total_tokens: Any,
    ai_response: Any,
) -> int:
    normalized_total_tokens = _normalize_positive_int(total_tokens)
    if normalized_total_tokens is not None:
        return normalized_total_tokens

    normalized_prompt_tokens = _normalize_positive_int(prompt_tokens) or 0
    normalized_completion_tokens = _normalize_positive_int(completion_tokens) or 0
    combined_tokens = normalized_prompt_tokens + normalized_completion_tokens
    if combined_tokens > 0:
        return combined_tokens

    if isinstance(ai_response, str):
        return max(0, len(ai_response))

    return 0


def _deduct_user_quota(connection: sqlite3.Connection, user_id: str, amount: int) -> None:
    if amount <= 0:
        return

    connection.execute(
        """
        UPDATE users
        SET quota = COALESCE(quota, 0) - ?,
            updated_at = ?
        WHERE id = ?;
        """,
        (amount, utc_now_iso(), user_id),
    )


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
                quota,
                created_at,
                updated_at,
                last_signin_at
            ) VALUES (?, ?, ?, NULL, NULL, ?, ?, ?, NULL);
            """,
            (
                user_id,
                username,
                hash_password(password),
                settings.default_user_quota,
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


def change_password(
    settings: Settings,
    *,
    user_id: str,
    old_password: str,
    new_password: str,
) -> dict[str, Any]:
    if old_password == new_password:
        raise AppError(400, "password_unchanged", "New password must be different.")

    with connection_scope(settings) as connection:
        row = connection.execute(
            """
            SELECT id, username, password_hash
            FROM users
            WHERE id = ?
            LIMIT 1;
            """,
            (user_id,),
        ).fetchone()
        if row is None:
            raise AppError(401, "auth_invalid", "User does not exist.")

        if not verify_password(old_password, row["password_hash"]):
            raise AppError(400, "current_password_incorrect", "Current password is incorrect.")

        now = utc_now_iso()
        connection.execute(
            """
            UPDATE users
            SET password_hash = ?, updated_at = ?
            WHERE id = ?;
            """,
            (hash_password(new_password), now, row["id"]),
        )
        payload = _issue_login_for_user(
            connection,
            user_id=row["id"],
            username=row["username"],
            ttl_days=settings.auth_token_ttl_days,
        )
        connection.commit()
        return payload


def add_user_quota(
    settings: Settings,
    *,
    username: str,
    amount: int,
) -> UserQuotaSummary:
    normalized_username = username.strip()
    if not normalized_username:
        raise AppError(400, "username_invalid", "Username is required.")

    if amount <= 0:
        raise AppError(400, "quota_amount_invalid", "Quota amount must be greater than 0.")

    now = utc_now_iso()
    with connection_scope(settings) as connection:
        row = connection.execute(
            """
            SELECT id, username, quota
            FROM users
            WHERE username = ?
            LIMIT 1;
            """,
            (normalized_username,),
        ).fetchone()
        if row is None:
            raise AppError(404, "user_not_found", "User does not exist.")

        quota_before = row["quota"]
        if not isinstance(quota_before, int):
            quota_before = int(quota_before or 0)
        quota_after = quota_before + amount

        connection.execute(
            """
            UPDATE users
            SET quota = ?,
                updated_at = ?
            WHERE id = ?;
            """,
            (quota_after, now, row["id"]),
        )
        connection.commit()

        return UserQuotaSummary(
            id=str(row["id"]),
            username=str(row["username"]),
            quota_before=quota_before,
            quota_after=quota_after,
        )


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
    allowed_model_ids = _read_allowed_model_ids(settings)
    sql_filter, params = _build_model_id_filter(allowed_model_ids)

    with connection_scope(settings) as connection:
        rows = connection.execute(
            f"""
            SELECT id, name
            FROM models
            WHERE 1 = 1{sql_filter}
            ORDER BY name COLLATE NOCASE ASC, id ASC;
            """,
            params,
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

        _ensure_user_can_create_tasks(connection, user_id)
        allowed_model_ids = _read_allowed_model_ids(settings)
        if allowed_model_ids is not None and model_id not in allowed_model_ids:
            raise AppError(404, "model_not_found", "Model does not exist.")

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
                available_at,
                queued_at,
                updated_at,
                acked_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, NULL, NULL, ?, NULL, NULL, ?, ?, ?, NULL);
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
                available_at = ?,
                queued_at = ?,
                updated_at = ?,
                error_code = NULL,
                error_message = NULL
            WHERE state = 'running';
            """,
            (now, now, now),
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
              AND COALESCE(available_at, created_at) <= ?
            ORDER BY COALESCE(queued_at, created_at) ASC, id ASC
            LIMIT 1;
            """,
            (now,),
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
    allowed_model_ids = _read_allowed_model_ids(settings)
    if allowed_model_ids is not None and model_id not in allowed_model_ids:
        raise AppError(404, "model_not_found", "Model does not exist.")

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
    allowed_model_ids = _read_allowed_model_ids(settings)
    sql_filter, params = _build_model_id_filter(allowed_model_ids)

    with connection_scope(settings) as connection:
        row = connection.execute(
            f"""
            SELECT *
            FROM models
            WHERE dealing_img = 1
            {sql_filter}
            ORDER BY id ASC
            LIMIT 1;
            """,
            params,
        ).fetchone()
    return row_to_dict(row)


def get_max_model_timeout_seconds(settings: Settings) -> float:
    allowed_model_ids = _read_allowed_model_ids(settings)
    sql_filter, params = _build_model_id_filter(allowed_model_ids)

    with connection_scope(settings) as connection:
        row = connection.execute(
            f"""
            SELECT MAX(COALESCE(timeout_seconds, ?)) AS max_timeout_seconds
            FROM models
            WHERE 1 = 1{sql_filter};
            """,
            (settings.upstream_timeout_seconds, *params),
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
    available_at: str,
    queued_at: str,
) -> dict[str, Any]:
    now = utc_now_iso()
    with connection_scope(settings) as connection:
        connection.execute(
            """
            UPDATE current_requests
            SET state = 'queued',
                retry_count = ?,
                error_code = ?,
                error_message = ?,
                started_at = NULL,
                finished_at = NULL,
                available_at = ?,
                queued_at = ?,
                updated_at = ?
            WHERE id = ?;
            """,
            (retry_count, error_code, error_message, available_at, queued_at, now, task_id),
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
        quota_cost = _calculate_quota_cost(
            prompt_tokens=current_row.get("prompt_tokens"),
            completion_tokens=current_row.get("completion_tokens"),
            total_tokens=current_row.get("total_tokens"),
            ai_response=current_row.get("ai_response"),
        )
        _deduct_user_quota(connection, str(current_row["user_id"]), quota_cost)
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
