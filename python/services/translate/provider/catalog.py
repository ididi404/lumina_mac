"""OpenAI-compatible translation provider presets.

Adding a free/paid OpenAI-compatible API = one entry here.
The frontend catalog in src/shared/translate-providers.ts must stay in sync
for Settings + pipeline dropdown (do not hardcode provider IDs in the UI).
"""
from __future__ import annotations

# id → { base_url, key_field, model_field, default_model }
OPENAI_PRESETS: dict[str, dict[str, str]] = {
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "key_field": "openrouterApiKey",
        "model_field": "openrouterModel",
        # Not openai/* — those are geo-blocked for many CN billing addresses.
        "default_model": "deepseek/deepseek-chat",
    },
    "siliconflow": {
        "base_url": "https://api.siliconflow.cn/v1",
        "key_field": "siliconflowApiKey",
        "model_field": "siliconflowModel",
        "default_model": "Qwen/Qwen2.5-7B-Instruct",
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "key_field": "zhipuApiKey",
        "model_field": "zhipuModel",
        "default_model": "glm-4-flash",
    },
    "hunyuan": {
        "base_url": "https://api.hunyuan.cloud.tencent.com/v1",
        "key_field": "hunyuanApiKey",
        "model_field": "hunyuanModel",
        "default_model": "hunyuan-lite",
    },
    "grok": {
        "base_url": "https://api.groq.com/openai/v1",
        "key_field": "grokApiKey",
        "model_field": "grokModel",
        "default_model": "llama-3.1-8b-instant",
    },
}
