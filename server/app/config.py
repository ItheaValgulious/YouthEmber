from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _load_local_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]

        os.environ.setdefault(key, value)


@dataclass(frozen=True)
class Settings:
    base_dir: Path
    data_dir: Path
    db_path: Path
    models_seed_path: Path
    cors_allowed_origins: tuple[str, ...]
    auth_token_ttl_days: int
    worker_thread_count: int
    worker_poll_interval_seconds: float
    worker_retry_delays_seconds: tuple[int, ...]
    upstream_timeout_seconds: float


def load_settings() -> Settings:
    base_dir = Path(__file__).resolve().parents[1]
    _load_local_env_file(base_dir / ".env.local")
    data_dir = base_dir / "data"
    default_db_path = data_dir / "ashdairy.db"
    default_models_seed_path = base_dir / "config" / "models.json"
    cors_allowed_origins_raw = os.getenv(
        "ASHDAIRY_SERVER_CORS_ALLOWED_ORIGINS",
        "http://127.0.0.1:5173,http://localhost:5173,http://localhost,capacitor://localhost,ionic://localhost",
    )
    cors_allowed_origins = tuple(
        item.strip() for item in cors_allowed_origins_raw.split(",") if item.strip()
    )

    retry_delays_raw = os.getenv("ASHDAIRY_SERVER_WORKER_RETRY_DELAYS", "5,15,30")
    retry_delays = tuple(
        int(item.strip()) for item in retry_delays_raw.split(",") if item.strip()
    ) or (5, 15, 30)
    worker_thread_count = max(
        1,
        int(os.getenv("ASHDAIRY_SERVER_WORKER_THREAD_COUNT", "3")),
    )

    return Settings(
        base_dir=base_dir,
        data_dir=data_dir,
        db_path=Path(os.getenv("ASHDAIRY_SERVER_DB_PATH", str(default_db_path))),
        models_seed_path=Path(
            os.getenv("ASHDAIRY_SERVER_MODELS_SEED_PATH", str(default_models_seed_path))
        ),
        cors_allowed_origins=cors_allowed_origins,
        auth_token_ttl_days=int(os.getenv("ASHDAIRY_SERVER_AUTH_TOKEN_TTL_DAYS", "30")),
        worker_thread_count=worker_thread_count,
        worker_poll_interval_seconds=float(
            os.getenv("ASHDAIRY_SERVER_WORKER_POLL_INTERVAL_SECONDS", "1")
        ),
        worker_retry_delays_seconds=retry_delays,
        upstream_timeout_seconds=float(
            os.getenv("ASHDAIRY_SERVER_UPSTREAM_TIMEOUT_SECONDS", "60")
        ),
    )
