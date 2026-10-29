"""Translation provider registry — discovers modules; presets from catalog."""
from __future__ import annotations

import importlib
from typing import Callable

from ._base import TranslateError
from .provider.catalog import OPENAI_PRESETS
from utils.logger import log

ProviderFn = Callable[[str, str, dict], str]
BatchFn = Callable[[list[str], str, dict], list[str]]

# Module name per provider id. OpenAI-compatible presets share openai_preset.
_PROVIDERS: dict[str, str] = {
    "custom": "custom",
    "gemini": "gemini",
    **{name: "openai_preset" for name in OPENAI_PRESETS},
}

_loaded: dict[str, object] = {}


def _provider_module(name: str):
    mod_name = _PROVIDERS[name]
    mod = _loaded.get(mod_name)
    if mod is None:
        mod = importlib.import_module(f".provider.{mod_name}", __package__)
        _loaded[mod_name] = mod
    return mod


def _provider_fn(name: str) -> ProviderFn:
    return _provider_module(name).translate


def _batch_fn(name: str) -> BatchFn | None:
    return getattr(_provider_module(name), "translate_batch", None)


def _provider_name(config: dict) -> str:
    name = (config.get("provider") or "").lower()
    # Legacy key — the generic provider was renamed llm -> custom
    return "custom" if name == "llm" else name


def list_providers() -> list[str]:
    """Registered provider ids (for diagnostics / future UI sync)."""
    return sorted(_PROVIDERS)


def translate_text(text: str, config: dict) -> str:
    name = _provider_name(config)
    if name not in _PROVIDERS:
        raise TranslateError(f"Unknown translation provider: {name!r}")
    target = config.get("targetLang") or "en"
    log.debug(f"Translate: provider={name} target={target} len={len(text)}")
    return _provider_fn(name)(text, target, config)


def translate_texts(texts: list[str], config: dict) -> list[str]:
    """Translate a list of texts (native batch if available)."""
    name = _provider_name(config)
    if name not in _PROVIDERS:
        raise TranslateError(f"Unknown translation provider: {name!r}")
    target = config.get("targetLang") or "en"
    log.debug(f"Translate batch: provider={name} target={target} count={len(texts)}")

    non_empty = [(i, t) for i, t in enumerate(texts) if t.strip()]
    if not non_empty:
        return [""] * len(texts)

    payload = [t for _, t in non_empty]

    prev_lines = config.get("previousLines") or []
    types = config.get("types") or []
    meta: dict = {}
    if prev_lines:
        meta["previousLines"] = [prev_lines[i] for i, _ in non_empty]
    if types:
        meta["types"] = [types[i] for i, _ in non_empty]
    if meta:
        config = {**config, **meta}

    batch_fn = _batch_fn(name)
    if batch_fn is not None:
        translated = batch_fn(payload, target, config)
    else:
        fn = _provider_fn(name)
        translated = []
        for (i, t) in non_empty:
            seg_config = config
            if prev_lines:
                seg_config = {**config, "previousLines": [prev_lines[i]]}
            if types:
                seg_config = {**seg_config, "types": [types[i]]}
            translated.append(fn(t, target, seg_config))

    results = [""] * len(texts)
    for (i, _), tr in zip(non_empty, translated):
        results[i] = tr
    return results


__all__ = [
    "TranslateError",
    "list_providers",
    "translate_text",
    "translate_texts",
]
