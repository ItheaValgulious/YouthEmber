from __future__ import annotations

from app.config import load_settings
from app.db import init_db
from app.services import AppError, add_user_quota


def prompt_non_empty(label: str) -> str:
    while True:
        value = input(label).strip()
        if value:
            return value
        print("Input cannot be empty. Please try again.")


def prompt_positive_int(label: str) -> int:
    while True:
        raw_value = input(label).strip()
        try:
            value = int(raw_value)
        except ValueError:
            print("Please enter a positive integer.")
            continue

        if value <= 0:
            print("Please enter an integer greater than 0.")
            continue

        return value


def main() -> int:
    settings = load_settings()
    init_db(settings)

    print(f"Database: {settings.db_path}")
    print(f"Default signup quota: {settings.default_user_quota}")

    username = prompt_non_empty("Username: ")
    amount = prompt_positive_int("Quota increment: ")

    try:
        summary = add_user_quota(settings, username=username, amount=amount)
    except AppError as exc:
        print(f"[{exc.error_code}] {exc.message}")
        return 1

    print("Quota updated.")
    print(f"User ID: {summary.id}")
    print(f"Username: {summary.username}")
    print(f"Quota before: {summary.quota_before}")
    print(f"Quota after: {summary.quota_after}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
