from __future__ import annotations

import copy
import json
import logging
import threading
from typing import Any

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, OpenAIError

from .config import Settings
from .services import (
    AppError,
    claim_next_queued_task,
    get_first_image_capable_model,
    get_max_model_timeout_seconds,
    get_model_for_task,
    mark_task_failed,
    mark_task_retrying,
    mark_task_succeeded,
    requeue_running_tasks,
)


logger = logging.getLogger(__name__)


IMAGE_SUMMARY_SYSTEM_PROMPT = (
    "You convert images into faithful text summaries for another text-only model. "
    "Do not answer the user's original task. Output plain text only."
)

IMAGE_SUMMARY_USER_PROMPT = (
    "Summarize all uploaded images for a text-only model. "
    "Focus on visible entities, scene, text inside images, layout, sequence, and any details "
    "that are likely relevant to the surrounding request."
)

IMAGE_SUMMARY_ATTACHMENT_PREFIX = (
    "Image context extracted by an image-capable model. "
    "Treat this as a replacement for the original images:\n"
)

IMAGE_PLACEHOLDER_TEXT = "[Image omitted. See the image summary attached below.]"


class UpstreamFailure(Exception):
    def __init__(self, error_code: str, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.error_code = error_code
        self.message = message
        self.retryable = retryable


class TaskWorker:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self._stop_event = threading.Event()
        self._threads: list[threading.Thread] = []
        self._join_timeout_seconds = max(5.0, float(settings.upstream_timeout_seconds) + 1.0)

    def start(self) -> None:
        if any(thread.is_alive() for thread in self._threads):
            return

        recovered = requeue_running_tasks(self.settings)
        if recovered:
            logger.warning("Requeued %s running tasks during startup recovery.", recovered)

        self._stop_event.clear()
        self._threads = []
        self._join_timeout_seconds = max(
            5.0,
            get_max_model_timeout_seconds(self.settings) + 1.0,
        )
        for index in range(self.settings.worker_thread_count):
            thread = threading.Thread(
                target=self._run_loop,
                name=f"ashdairy-task-worker-{index + 1}",
                daemon=True,
            )
            thread.start()
            self._threads.append(thread)

    def stop(self) -> None:
        self._stop_event.set()
        for thread in self._threads:
            thread.join(timeout=self._join_timeout_seconds)
        self._threads = []

    def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            task = claim_next_queued_task(self.settings)
            if task is None:
                self._stop_event.wait(self.settings.worker_poll_interval_seconds)
                continue

            try:
                self._process_task(task)
            except Exception:
                logger.exception("Worker loop crashed while processing task %s.", task.get("id"))

    def _process_task(self, task: dict[str, Any]) -> None:
        task_id = str(task["id"])
        retry_count = int(task.get("retry_count") or 0)
        retry_delays = self.settings.worker_retry_delays_seconds

        while not self._stop_event.is_set():
            try:
                model_row = get_model_for_task(self.settings, str(task["model_id"]))
                request_body = json.loads(str(task["request_body"]))
                final_request_body = self._prepare_request_body_for_model(request_body, model_row)
                response_text, usage = self._call_upstream(model_row, final_request_body)
                mark_task_succeeded(
                    self.settings,
                    task_id=task_id,
                    ai_response=response_text,
                    prompt_tokens=usage["prompt_tokens"],
                    completion_tokens=usage["completion_tokens"],
                    total_tokens=usage["total_tokens"],
                )
                return
            except AppError as exc:
                logger.warning("Task %s failed with app error %s.", task_id, exc.error_code)
                mark_task_failed(
                    self.settings,
                    task_id=task_id,
                    retry_count=retry_count,
                    error_code=exc.error_code,
                    error_message=exc.message,
                )
                return
            except UpstreamFailure as exc:
                logger.warning(
                    "Task %s upstream failure %s (retryable=%s, retry_count=%s).",
                    task_id,
                    exc.error_code,
                    exc.retryable,
                    retry_count,
                )
                if exc.retryable and retry_count < len(retry_delays):
                    retry_count += 1
                    mark_task_retrying(
                        self.settings,
                        task_id=task_id,
                        retry_count=retry_count,
                        error_code=exc.error_code,
                        error_message=exc.message,
                    )
                    if self._stop_event.wait(retry_delays[retry_count - 1]):
                        return
                    continue

                mark_task_failed(
                    self.settings,
                    task_id=task_id,
                    retry_count=retry_count,
                    error_code=exc.error_code,
                    error_message=exc.message,
                )
                return
            except Exception as exc:
                logger.exception("Task %s failed with an unexpected worker error.", task_id)
                failure = UpstreamFailure(
                    error_code="worker_internal_error",
                    message=str(exc) or "Worker internal error.",
                    retryable=retry_count < len(retry_delays),
                )
                if failure.retryable:
                    retry_count += 1
                    mark_task_retrying(
                        self.settings,
                        task_id=task_id,
                        retry_count=retry_count,
                        error_code=failure.error_code,
                        error_message=failure.message,
                    )
                    if self._stop_event.wait(retry_delays[retry_count - 1]):
                        return
                    continue

                mark_task_failed(
                    self.settings,
                    task_id=task_id,
                    retry_count=retry_count,
                    error_code=failure.error_code,
                    error_message=failure.message,
                )
                return

    def _prepare_request_body_for_model(
        self,
        request_body: dict[str, Any],
        target_model: dict[str, Any],
    ) -> dict[str, Any]:
        if not self._request_has_images(request_body):
            return self._build_provider_request(target_model, request_body)

        if bool(target_model.get("dealing_img")):
            return self._build_provider_request(target_model, request_body)

        image_model = get_first_image_capable_model(self.settings)
        if image_model is None:
            raise AppError(
                503,
                "image_model_unavailable",
                "No image-capable model is available on the server.",
            )

        image_summary = self._summarize_images(request_body, image_model)
        text_only_body = self._build_text_only_request_body(request_body, image_summary)
        return self._build_provider_request(target_model, text_only_body)

    def _summarize_images(
        self,
        request_body: dict[str, Any],
        image_model: dict[str, Any],
    ) -> str:
        messages = request_body.get("messages")
        image_parts = self._extract_image_parts(messages)
        if not image_parts:
            return ""

        context_text = self._extract_text_context(messages)
        user_content: list[dict[str, Any]] = [
            {
                "type": "text",
                "text": self._build_image_summary_instruction(context_text),
            }
        ]
        user_content.extend(image_parts)

        summary_request = {
            "model": image_model["model"],
            "stream": False,
            "temperature": 0.2,
            "max_tokens": 1200,
            "messages": [
                {
                    "role": "system",
                    "content": IMAGE_SUMMARY_SYSTEM_PROMPT,
                },
                {
                    "role": "user",
                    "content": user_content,
                },
            ],
        }
        response_text, _usage = self._call_upstream(image_model, summary_request)
        if not response_text.strip():
            raise UpstreamFailure(
                error_code="provider_invalid_response",
                message="Image summary model returned empty content.",
                retryable=False,
            )
        return response_text.strip()

    def _build_provider_request(
        self,
        model_row: dict[str, Any],
        request_body: dict[str, Any],
    ) -> dict[str, Any]:
        payload = copy.deepcopy(request_body)
        payload["model"] = model_row["model"]
        payload["stream"] = False
        return payload

    def _call_upstream(
        self,
        model_row: dict[str, Any],
        request_body: dict[str, Any],
    ) -> tuple[str, dict[str, int | None]]:
        timeout_seconds = self._resolve_timeout_seconds(model_row)
        client = OpenAI(
            base_url=str(model_row["baseurl"]),
            api_key=str(model_row["apikey"]),
            timeout=timeout_seconds,
            max_retries=0,
        )
        try:
            response = client.chat.completions.create(**request_body)
        except TypeError as exc:
            raise UpstreamFailure(
                error_code="provider_http_error",
                message="Request body is invalid for the upstream provider.",
                retryable=False,
            ) from exc
        except APITimeoutError as exc:
            raise UpstreamFailure(
                error_code="provider_timeout",
                message=f"Upstream provider timed out after {timeout_seconds:g}s.",
                retryable=True,
            ) from exc
        except APIConnectionError as exc:
            raise UpstreamFailure(
                error_code="provider_timeout",
                message="Failed to connect to upstream provider.",
                retryable=True,
            ) from exc
        except APIStatusError as exc:
            status_code = getattr(exc, "status_code", None)
            message = getattr(exc, "message", None) or str(exc)
            retryable = status_code in {408, 409, 429} or (
                isinstance(status_code, int) and status_code >= 500
            )
            raise UpstreamFailure(
                error_code="provider_http_error",
                message=f"Upstream HTTP error ({status_code}): {message}",
                retryable=retryable,
            ) from exc
        except OpenAIError as exc:
            raise UpstreamFailure(
                error_code="provider_http_error",
                message=str(exc) or "Upstream provider error.",
                retryable=False,
            ) from exc

        response_text = self._extract_response_text(response)
        usage = self._read_field(response, "usage")
        return response_text, {
            "prompt_tokens": self._read_field(usage, "prompt_tokens"),
            "completion_tokens": self._read_field(usage, "completion_tokens"),
            "total_tokens": self._read_field(usage, "total_tokens"),
        }

    def _resolve_timeout_seconds(self, model_row: dict[str, Any]) -> float:
        raw_value = model_row.get("timeout_seconds")
        if isinstance(raw_value, (int, float)) and float(raw_value) > 0:
            return float(raw_value)

        return float(self.settings.upstream_timeout_seconds)

    def _extract_response_text(self, response: Any) -> str:
        choices = self._read_field(response, "choices")
        if not choices:
            raise UpstreamFailure(
                error_code="provider_invalid_response",
                message="Upstream response does not contain choices.",
                retryable=False,
            )

        message = self._read_field(choices[0], "message")
        if message is None:
            raise UpstreamFailure(
                error_code="provider_invalid_response",
                message="Upstream response does not contain a message.",
                retryable=False,
            )

        content = self._read_field(message, "content")
        if isinstance(content, str):
            text = content.strip()
            if text:
                return text

        if isinstance(content, list):
            parts: list[str] = []
            for item in content:
                part_text = self._read_field(item, "text")
                if isinstance(part_text, str) and part_text.strip():
                    parts.append(part_text.strip())
            joined = "\n".join(parts).strip()
            if joined:
                return joined

        refusal = self._read_field(message, "refusal")
        if isinstance(refusal, str) and refusal.strip():
            return refusal.strip()

        raise UpstreamFailure(
            error_code="provider_invalid_response",
            message="Upstream response does not contain text content.",
            retryable=False,
        )

    def _request_has_images(self, request_body: dict[str, Any]) -> bool:
        messages = request_body.get("messages")
        if not isinstance(messages, list):
            return False
        for message in messages:
            if self._message_has_images(message):
                return True
        return False

    def _message_has_images(self, message: Any) -> bool:
        if not isinstance(message, dict):
            return False
        content = message.get("content")
        if isinstance(content, list):
            return any(self._is_image_part(part) for part in content)
        return self._is_image_part(content)

    def _extract_image_parts(self, messages: Any) -> list[dict[str, Any]]:
        if not isinstance(messages, list):
            return []
        parts: list[dict[str, Any]] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            content = message.get("content")
            if isinstance(content, list):
                for part in content:
                    if self._is_image_part(part) and isinstance(part, dict):
                        parts.append(copy.deepcopy(part))
            elif self._is_image_part(content) and isinstance(content, dict):
                parts.append(copy.deepcopy(content))
        return parts

    def _extract_text_context(self, messages: Any) -> str:
        if not isinstance(messages, list):
            return ""

        chunks: list[str] = []
        for message in messages:
            if not isinstance(message, dict):
                continue
            role = str(message.get("role", "user")).strip() or "user"
            text = self._content_to_text(message.get("content")).strip()
            if text:
                chunks.append(f"{role}: {text}")
        return "\n\n".join(chunks)

    def _build_image_summary_instruction(self, context_text: str) -> str:
        if not context_text.strip():
            return IMAGE_SUMMARY_USER_PROMPT

        trimmed = context_text.strip()
        if len(trimmed) > 4000:
            trimmed = trimmed[:4000]
        return f"{IMAGE_SUMMARY_USER_PROMPT}\n\nRelevant text context:\n{trimmed}"

    def _build_text_only_request_body(
        self,
        request_body: dict[str, Any],
        image_summary: str,
    ) -> dict[str, Any]:
        payload = copy.deepcopy(request_body)
        messages = payload.get("messages")
        cleaned_messages: list[dict[str, Any]] = []

        if isinstance(messages, list):
            for message in messages:
                if not isinstance(message, dict):
                    continue
                cloned_message = copy.deepcopy(message)
                cloned_message["content"] = self._content_to_text(message.get("content"))
                cleaned_messages.append(cloned_message)

        cleaned_messages.append(
            {
                "role": "system",
                "content": f"{IMAGE_SUMMARY_ATTACHMENT_PREFIX}{image_summary}",
            }
        )
        payload["messages"] = cleaned_messages
        return payload

    def _content_to_text(self, content: Any) -> str:
        if isinstance(content, str):
            return content

        if isinstance(content, list):
            parts: list[str] = []
            had_image = False
            for item in content:
                if self._is_image_part(item):
                    had_image = True
                    continue
                if isinstance(item, dict):
                    text_value = item.get("text")
                    if isinstance(text_value, str) and text_value.strip():
                        parts.append(text_value.strip())
                elif isinstance(item, str) and item.strip():
                    parts.append(item.strip())
            if parts:
                return "\n\n".join(parts)
            if had_image:
                return IMAGE_PLACEHOLDER_TEXT
            return ""

        if isinstance(content, dict):
            if self._is_image_part(content):
                return IMAGE_PLACEHOLDER_TEXT
            text_value = content.get("text")
            if isinstance(text_value, str):
                return text_value
            return ""

        return ""

    def _is_image_part(self, value: Any) -> bool:
        if not isinstance(value, dict):
            return False

        part_type = str(value.get("type", "")).strip().lower()
        if part_type in {"image_url", "input_image", "image"}:
            return True
        if "image_url" in value:
            return True
        if "input_image" in value:
            return True
        return False

    def _read_field(self, value: Any, name: str) -> Any:
        if isinstance(value, dict):
            return value.get(name)
        return getattr(value, name, None)
