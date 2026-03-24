from __future__ import annotations

import json
import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterable

from .config import Settings
from .security import utc_now_iso


def ensure_data_dirs(settings: Settings) -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)


def get_connection(settings: Settings) -> sqlite3.Connection:
    connection = sqlite3.connect(
        settings.db_path,
        timeout=30,
        check_same_thread=False,
    )
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON;")
    return connection


@contextmanager
def connection_scope(settings: Settings):
    connection = get_connection(settings)
    try:
        yield connection
    finally:
        connection.close()


def init_db(settings: Settings) -> None:
    ensure_data_dirs(settings)
    with connection_scope(settings) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                auth_token_hash TEXT,
                auth_token_expires_at TEXT,
                quota INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                last_signin_at TEXT
            );

            CREATE TABLE IF NOT EXISTS models (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                baseurl TEXT NOT NULL,
                apikey TEXT NOT NULL,
                model TEXT NOT NULL,
                dealing_img INTEGER NOT NULL DEFAULT 0,
                timeout_seconds REAL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS current_requests (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                client_request_id TEXT NOT NULL,
                state TEXT NOT NULL,
                model_id TEXT NOT NULL,
                model_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                request_body TEXT NOT NULL,
                ai_response TEXT,
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_tokens INTEGER,
                retry_count INTEGER NOT NULL DEFAULT 0,
                error_code TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                available_at TEXT,
                queued_at TEXT,
                updated_at TEXT NOT NULL,
                acked_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (model_id) REFERENCES models(id),
                UNIQUE (user_id, client_request_id)
            );

            CREATE INDEX IF NOT EXISTS idx_current_requests_state_created_at
            ON current_requests (state, created_at);

            CREATE INDEX IF NOT EXISTS idx_current_requests_state_available_queued_at
            ON current_requests (state, available_at, queued_at, id);

            CREATE TABLE IF NOT EXISTS request_stats (
                request_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                client_request_id TEXT NOT NULL,
                state TEXT NOT NULL,
                model_id TEXT NOT NULL,
                model_name TEXT NOT NULL,
                provider TEXT NOT NULL,
                prompt_tokens INTEGER,
                completion_tokens INTEGER,
                total_tokens INTEGER,
                retry_count INTEGER NOT NULL DEFAULT 0,
                error_code TEXT,
                created_at TEXT NOT NULL,
                started_at TEXT,
                finished_at TEXT,
                updated_at TEXT NOT NULL,
                acked_at TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (model_id) REFERENCES models(id)
            );

            CREATE INDEX IF NOT EXISTS idx_request_stats_user_client_request
            ON request_stats (user_id, client_request_id);
            """
        )
        _ensure_column(connection, "users", "quota", "INTEGER NOT NULL DEFAULT 0")
        _ensure_column(connection, "models", "timeout_seconds", "REAL")
        _ensure_column(connection, "current_requests", "available_at", "TEXT")
        _ensure_column(connection, "current_requests", "queued_at", "TEXT")
        connection.execute(
            """
            UPDATE users
            SET quota = ?
            WHERE quota IS NULL;
            """,
            (settings.default_user_quota,),
        )
        connection.execute(
            """
            UPDATE models
            SET timeout_seconds = ?
            WHERE timeout_seconds IS NULL OR timeout_seconds <= 0;
            """,
            (settings.upstream_timeout_seconds,),
        )
        connection.execute(
            """
            UPDATE current_requests
            SET available_at = COALESCE(available_at, created_at),
                queued_at = COALESCE(queued_at, created_at)
            WHERE available_at IS NULL OR queued_at IS NULL;
            """
        )
        connection.commit()


def _column_exists(connection: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    rows = connection.execute(f"PRAGMA table_info({table_name});").fetchall()
    return any(str(row["name"]) == column_name for row in rows)


def _ensure_column(
    connection: sqlite3.Connection,
    table_name: str,
    column_name: str,
    definition: str,
) -> None:
    if _column_exists(connection, table_name, column_name):
        return

    connection.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {definition};")


def seed_models_if_needed(settings: Settings) -> None:
    seed_path = settings.models_seed_path
    if not seed_path.exists():
        return

    with connection_scope(settings) as connection:
        raw_text = seed_path.read_text(encoding="utf-8")
        payload = json.loads(raw_text)
        if not isinstance(payload, list):
            raise ValueError("models seed file must contain a JSON array")

        now = utc_now_iso()
        rows: list[tuple[Any, ...]] = []
        for item in payload:
            if not isinstance(item, dict):
                continue
            model_id = str(item.get("id", "")).strip()
            name = str(item.get("name", "")).strip()
            baseurl = str(item.get("baseurl", "")).strip()
            apikey = str(item.get("apikey", "")).strip()
            if not apikey:
                apikey_env = str(item.get("apikey_env", "")).strip()
                if apikey_env:
                    apikey = os.getenv(apikey_env, "").strip()
            model = str(item.get("model", "")).strip()
            dealing_img = 1 if bool(item.get("dealing_img")) else 0
            timeout_seconds = item.get("timeout_seconds")
            if isinstance(timeout_seconds, (int, float)) and float(timeout_seconds) > 0:
                resolved_timeout_seconds = float(timeout_seconds)
            else:
                resolved_timeout_seconds = float(settings.upstream_timeout_seconds)
            if not (model_id and name and baseurl and apikey and model):
                continue
            rows.append(
                (
                    model_id,
                    name,
                    baseurl,
                    apikey,
                    model,
                    dealing_img,
                    resolved_timeout_seconds,
                    now,
                    now,
                )
            )

        if rows:
            connection.executemany(
                """
                INSERT INTO models (
                    id,
                    name,
                    baseurl,
                    apikey,
                    model,
                    dealing_img,
                    timeout_seconds,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    baseurl = excluded.baseurl,
                    apikey = excluded.apikey,
                    model = excluded.model,
                    dealing_img = excluded.dealing_img,
                    timeout_seconds = excluded.timeout_seconds,
                    updated_at = excluded.updated_at;
                """,
                rows,
            )
            connection.commit()


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def rows_to_dicts(rows: Iterable[sqlite3.Row]) -> list[dict[str, Any]]:
    return [row_to_dict(row) for row in rows if row is not None]
