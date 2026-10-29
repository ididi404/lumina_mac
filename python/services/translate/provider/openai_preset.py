"""Generic OpenAI-compatible preset providers (OpenRouter, SiliconFlow, …)."""
from __future__ import annotations

from .._base import (
    TranslateError,
    build_batch_prompt,
    build_single_prompt,
    build_system_instruction,
    parse_batch_response,
)
from ..protocol.openai import chat
from .catalog import OPENAI_PRESETS
from utils.logger import log


def _resolve(config: dict) -> tuple[str, str, str, str]:
    """(provider_id, base_url, api_key, model)."""
    name = (config.get("provider") or "").lower()
    preset = OPENAI_PRESETS.get(name)
    if not preset:
        raise TranslateError(f"Unknown OpenAI preset provider: {name!r}")
    model = (config.get(preset["model_field"]) or preset["default_model"] or "").strip()
    api_key = (config.get(preset["key_field"]) or "").strip()
    return name, preset["base_url"], api_key, model


def translate(text: str, target: str, config: dict) -> str:
    name, base_url, api_key, model = _resolve(config)
    if not api_key:
        raise TranslateError(f"{name} API key not configured")
    if not model:
        raise TranslateError("LLM model not configured")
    log.debug(f"{name} translate: model={model}")
    system = build_system_instruction(config, target)
    prev = config.get("previousLines") or ""
    if isinstance(prev, list):
        prev = " / ".join(str(p) for p in prev if p)
    return chat(
        base_url,
        api_key,
        model,
        system,
        build_single_prompt(text, target, previous_line=prev),
    )


def translate_batch(
    texts: list[str], target: str, config: dict
) -> list[str]:
    name, base_url, api_key, model = _resolve(config)
    if not api_key:
        raise TranslateError(f"{name} API key not configured")
    if not model:
        raise TranslateError("LLM model not configured")
    log.debug(f"{name} translate_batch: model={model} count={len(texts)}")
    system = build_system_instruction(config, target, previous_line="")
    raw = chat(
        base_url,
        api_key,
        model,
        system,
        build_batch_prompt(
            texts,
            target,
            previous_lines=config.get("previousLines"),
            types=config.get("types"),
        ),
        json_mode=True,
    )
    return parse_batch_response(raw, len(texts))
