"""Shared transport, errors and prompt helpers for translation providers."""
from __future__ import annotations

import ast
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

from utils.logger import log


class TranslateError(Exception):
    pass


def _sanitize_url(url: str) -> str:
    """Strip query string (e.g. Gemini API key) before logging."""
    return url.split("?", 1)[0]


def _describe_http_error(err: urllib.error.HTTPError) -> str:
    """"HTTP <code> <reason>: <response body>" — the body holds the real cause."""
    detail = f"HTTP {err.code} {err.reason}"
    try:
        body = err.read().decode("utf-8", "replace").strip()
        if body:
            detail += f": {body[:500]}"
    except Exception:
        pass
    return detail


def http_post_json(url: str, payload: dict, headers: dict | None = None) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json", **(headers or {})},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        log.warn(f"POST {_sanitize_url(url)} -> {_describe_http_error(e)}")
        raise TranslateError(_describe_http_error(e)) from e
    except Exception as e:
        log.warn(f"POST {_sanitize_url(url)} failed: {e}")
        raise


def http_get_json(url: str, headers: dict | None = None) -> dict:
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read().decode("utf-8"))


# Default instruction lives in prompts/translate-default.md.
# {target} placeholder is replaced with the target language at request time.
_PROMPTS_DIR = Path(__file__).resolve().parent.parent.parent / "prompts"


def load_default_instruction() -> str:
    try:
        return (_PROMPTS_DIR / "translate-default.md").read_text(encoding="utf-8")
    except OSError:
        return "Translate the given text into {target}. Output ONLY the translation."


# BCP-47-ish codes from the settings UI → unambiguous names for LLM prompts.
# Bare "zh" is treated as Simplified; models otherwise freely mix 简/繁.
_TARGET_LANG_NAMES: dict[str, str] = {
    "zh": "Simplified Chinese (简体中文)",
    "zh-cn": "Simplified Chinese (简体中文)",
    "zh-hans": "Simplified Chinese (简体中文)",
    "zh-sg": "Simplified Chinese (简体中文)",
    "zh-tw": "Traditional Chinese (繁體中文)",
    "zh-hk": "Traditional Chinese (繁體中文)",
    "zh-mo": "Traditional Chinese (繁體中文)",
    "zh-hant": "Traditional Chinese (繁體中文)",
    "en": "English",
    "ja": "Japanese",
    "ko": "Korean",
    "vi": "Vietnamese",
    "th": "Thai",
    "id": "Indonesian",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
    "ru": "Russian",
    "pt": "Portuguese",
}


def resolve_target_language(code: str) -> str:
    """Map a UI language code to an explicit name for prompts.

    Passing bare ``zh`` makes models oscillate between Simplified and
    Traditional; always spell out the script variant.
    """
    raw = (code or "").strip()
    if not raw:
        return "English"
    key = raw.lower().replace("_", "-")
    if key in _TARGET_LANG_NAMES:
        return _TARGET_LANG_NAMES[key]
    # zh-XXX fallbacks (e.g. custom "zh-CN")
    if key.startswith("zh-hans") or key in ("zh-cn", "zh-sg"):
        return _TARGET_LANG_NAMES["zh"]
    if key.startswith("zh-hant") or key.startswith("zh-tw") or key.startswith(
        "zh-hk"
    ):
        return _TARGET_LANG_NAMES["zh-tw"]
    if key.startswith("zh"):
        return _TARGET_LANG_NAMES["zh"]
    return raw


def _render_template(template: str, values: dict) -> str:
    """Replace {{key}} placeholders; missing keys become empty strings."""
    out = template
    for key, value in values.items():
        out = out.replace("{{" + key + "}}", str(value or ""))
    # Strip any leftover unknown placeholders
    return re.sub(r"\{\{\w+\}\}", "", out)


def build_system_instruction(
    config: dict, target: str, previous_line: str | None = None
) -> str:
    """Render the system instruction from config template + target."""
    target_name = resolve_target_language(target)
    if previous_line is None:
        prev = config.get("previousLines") or config.get("previousLine") or ""
        if isinstance(prev, list):
            # Join the whole context — prev[0] alone is the FIRST line of the
            # page, which is often wrong/irrelevant for the current segment.
            previous_line = " / ".join(str(p) for p in prev if p)
        else:
            previous_line = str(prev)
    return _render_template(
        config.get("llmInstruction") or load_default_instruction(),
        {
            "target_language": target_name,
            "previous_line": previous_line,
        },
    )


def build_single_prompt(
    text: str, target: str, previous_line: str | None = None
) -> str:
    target_name = resolve_target_language(target)
    prompt = f"Target language: {target_name}\n\nText:\n{text}"
    if previous_line:
        prompt = (
            f"Target language: {target_name}\n\n"
            f"Preceding dialogue for continuity:\n{previous_line}\n\n"
            f"Text:\n{text}"
        )
    return prompt


_SEGMENT_TYPE_LABELS = {
    "text_bubble": "dialogue (speech bubble)",
    "bubble": "dialogue (speech bubble)",
    "text_free": "narration/caption",
}


def build_batch_prompt(
    texts: list[str],
    target: str,
    previous_lines: list[str] | None = None,
    types: list[str] | None = None,
) -> str:
    """User prompt for one JSON chat completion over many texts."""
    ctx = previous_lines or [""] * len(texts)
    ty = types or [""] * len(texts)
    segments: list[dict] = []
    for i, (t, c, k) in enumerate(zip(texts, ctx, ty)):
        seg: dict = {"id": i, "text": t}
        label = _SEGMENT_TYPE_LABELS.get(k, k)
        if label:
            seg["type"] = label
        if c:
            seg["context"] = c
        segments.append(seg)
    target_name = resolve_target_language(target)
    script_rule = ""
    lower = target_name.lower()
    if "simplified chinese" in lower or "简体" in target_name:
        script_rule = (
            "- CRITICAL: write Simplified Chinese (简体中文) only — never "
            "Traditional characters (繁體/正體). Do not follow Traditional "
            "forms that may appear in context.\n"
        )
    elif "traditional chinese" in lower or "繁體" in target_name or "繁体" in target_name:
        script_rule = (
            "- CRITICAL: write Traditional Chinese (繁體中文) only — never "
            "Simplified characters (简体). Do not follow Simplified forms "
            "that may appear in context.\n"
        )
    return (
        f"Target language: {target_name}\n\n"
        "This is a manga page. The input is a JSON array of text segments "
        "(OCR output) in reading order; the OCR text may be truncated or "
        "imperfect. Each segment has an \"id\", the source \"text\", and may "
        "carry a \"type\" (dialogue (speech bubble) / narration/caption / "
        "SFX) and a \"context\" (a few preceding lines already translated).\n"
        "CRITICAL — one segment, one translation:\n"
        "- Translate ONLY that segment's \"text\" field.\n"
        "- NEVER copy, quote, concatenate, or merge any part of \"context\" "
        "(or any other segment) into the output value.\n"
        "- NEVER combine multiple bubbles into one string.\n"
        "Use context only as a silent hint to:\n"
        "- complete truncated lines;\n"
        "- keep character names, honorifics, and terms consistent;\n"
        "- resolve ambiguous fragments;\n"
        "- match the register: dialogue is casual and natural, narration is "
        "more formal.\n"
        f"{script_rule}"
        "- if a segment is already fully in the target language AND the "
        "correct script variant, return it unchanged.\n"
        "- preserve the source text's line breaks as escaped \"\\n\" inside "
        "the translated string.\n"
        "Respond with ONLY a JSON object mapping each segment id (as a string "
        'key) to its translation, e.g. {"0": "translation of 0", "1": '
        '"translation of 1"}. Never skip, merge, or renumber ids; type, '
        "context, and source text must not appear in the output. If you "
        "cannot translate a segment, repeat its source text as the value.\n\n"
        f"{json.dumps(segments, ensure_ascii=False)}"
    )


def parse_numbered_batch(raw: str, count: int, label: str = "LLM") -> list[str]:
    """Parse "[i] text" lines back into a result array of size `count`."""
    results: list[str] = [""] * count
    seen = [False] * count
    pattern = re.compile(r"^\s*[\[\(]?(\d+)[\]\)]?\s*[.:\-]?\s*(.*)$")
    for line in raw.splitlines():
        m = pattern.match(line)
        if not m:
            continue
        idx = int(m.group(1))
        val = m.group(2).strip().replace("⏎", "\n")
        if 0 <= idx < count and not seen[idx]:
            results[idx] = val
            seen[idx] = True

    missing = [i for i, ok in enumerate(seen) if not ok]
    if missing:
        log.warn(
            f"{label} batch response missing translations for indices: "
            f"{missing} — filling with empty strings"
        )
    return results


_FENCE_RE = re.compile(r"^```[a-zA-Z]*\s*(.*?)```\s*$", re.DOTALL)


def _strip_code_fence(raw: str) -> str:
    """Remove a single ```...``` wrapper some models add around JSON."""
    m = _FENCE_RE.match(raw.strip())
    return m.group(1).strip() if m else raw.strip()


def _segment_value(value) -> str:
    """Coerce a JSON value into the segment's translation text."""
    if isinstance(value, str):
        return value
    if value is None or isinstance(value, bool):
        return ""
    return str(value)


def _warn_missing(seen: list[bool], count: int, label: str) -> None:
    missing = [i for i, ok in enumerate(seen) if not ok]
    if missing:
        log.warn(
            f"{label} batch response missing translations for indices: "
            f"{missing} — filling with empty strings"
        )


def parse_batch_response(raw: str, count: int, label: str = "LLM") -> list[str]:
    """Parse a model batch response into a size-`count` list.

    JSON first — an object {id: translation} (preferred) or an array of
    translations, tolerating code fences, single quotes and trailing commas —
    falling back to the legacy numbered-list parser when the response is not
    JSON-shaped at all.
    """
    cleaned = _strip_code_fence(raw)

    data = None
    if cleaned[:1] in ("{", "["):
        try:
            data = json.loads(cleaned)
        except Exception:
            pass
        if data is None:
            try:  # tolerate single quotes / trailing commas
                data = ast.literal_eval(cleaned)
            except Exception:
                data = None
        if data is None:
            log.warn(
                f"{label} batch response looked like JSON but failed to parse "
                "— falling back to numbered-list parsing"
            )

    if isinstance(data, dict):
        results: list[str] = [""] * count
        seen = [False] * count
        for key, value in data.items():
            try:
                idx = int(key)
            except (TypeError, ValueError):
                continue
            if 0 <= idx < count and not seen[idx]:
                results[idx] = _segment_value(value)
                seen[idx] = True
        _warn_missing(seen, count, label)
        return results

    if isinstance(data, list):
        n = min(len(data), count)
        seen = [True] * n + [False] * (count - n)
        _warn_missing(seen, count, label)
        return [_segment_value(v) for v in data[:n]] + [""] * (count - n)

    return parse_numbered_batch(raw, count, label)
