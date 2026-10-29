"""Google Gemini batch translation."""
from __future__ import annotations

import socket

from .._base import (
    TranslateError,
    build_batch_prompt,
    build_system_instruction,
    http_post_json,
    parse_batch_response,
)
from utils.logger import log

_API_BASE = "https://generativelanguage.googleapis.com/v1beta"
# Free-tier friendly default (GA). gemini-2.0-flash shut down 2026-06-01.
_DEFAULT_MODEL = "gemini-3.5-flash-lite"


def translate_batch(
    texts: list[str], target: str, config: dict
) -> list[str]:
    api_key = (config.get("geminiApiKey") or "").strip()
    model = (config.get("geminiModel") or _DEFAULT_MODEL).strip()
    if not api_key:
        raise TranslateError("Gemini API key not configured")

    log.debug(f"Gemini translate: model={model} count={len(texts)}")
    system = build_system_instruction(config, target, previous_line="")
    log.debug(f"Gemini system prompt: {system[:200]}{'...' if len(system) > 200 else ''}")
    user = build_batch_prompt(
        texts,
        target,
        previous_lines=config.get("previousLines"),
        types=config.get("types"),
    )

    url = f"{_API_BASE}/models/{model}:generateContent?key={api_key}"
    body = {
        "system_instruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": user}]}],
        "generationConfig": {
            "temperature": 0.3,
            "responseMimeType": "application/json",
        },
    }
    try:
        result = http_post_json(url, body)
    except TranslateError:
        raise
    except (TimeoutError, socket.timeout) as e:
        raise TranslateError(
            "Gemini timed out reaching generativelanguage.googleapis.com — "
            "check network / VPN (this endpoint is often blocked in CN)"
        ) from e
    except Exception as e:
        msg = str(e)
        if "timed out" in msg.lower() or "timeout" in msg.lower():
            raise TranslateError(
                "Gemini timed out reaching generativelanguage.googleapis.com — "
                "check network / VPN (this endpoint is often blocked in CN)"
            ) from e
        raise TranslateError(f"Gemini request failed: {e}") from e

    candidates = result.get("candidates") or []
    if not candidates:
        raise TranslateError(f"Gemini returned no candidates: {result}")
    parts = (candidates[0].get("content") or {}).get("parts") or []
    raw = "".join(p.get("text", "") for p in parts).strip()
    return parse_batch_response(raw, len(texts), label="Gemini")


def translate(text: str, target: str, config: dict) -> str:
    return translate_batch([text], target, config)[0]
