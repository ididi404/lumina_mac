/**
 * Single source of truth for translation providers.
 * Settings UI + pipeline dropdown both read this list — do not hardcode IDs elsewhere.
 */

export type ProviderKind = "custom" | "openai-preset" | "gemini";

export interface TranslateModelOption {
  /** Exact model id sent to the API */
  id: string;
  /** Optional short label; defaults to id */
  label?: string;
  /** Hint for UI — free-tier / no-cost friendly */
  free?: boolean;
}

export interface TranslateProviderDef {
  id: string;
  kind: ProviderKind;
  /** i18n key for the select / dropdown label */
  labelKey: string;
  /** English fallback when i18n is missing */
  label: string;
  /** Config + vault field for the API key (omit for custom — uses llmApiKey) */
  apiKeyField?: string;
  /** Config field for the model id */
  modelField?: string;
  defaultModel?: string;
  keyPlaceholder?: string;
  /** Fixed OpenAI-compatible base URL (openai-preset only) */
  baseUrl?: string;
  /** Curated free / recommended models for the settings dropdown */
  models?: TranslateModelOption[];
}

/** OpenAI-compatible presets (key + model; fixed base URL). */
export const OPENAI_PRESET_PROVIDERS: TranslateProviderDef[] = [
  {
    id: "openrouter",
    kind: "openai-preset",
    labelKey: "settings.providerOpenRouter",
    label: "OpenRouter",
    apiKeyField: "openrouterApiKey",
    modelField: "openrouterModel",
    // Avoid openai/* defaults — OpenRouter geo-blocks OpenAI/Anthropic/Google
    // for many CN billing addresses (403 regional surcharge / geo gate).
    defaultModel: "deepseek/deepseek-chat",
    keyPlaceholder: "sk-or-v1-...",
    baseUrl: "https://openrouter.ai/api/v1",
    models: [
      { id: "deepseek/deepseek-chat", label: "DeepSeek Chat", free: true },
      { id: "deepseek/deepseek-r1", label: "DeepSeek R1", free: true },
      {
        id: "qwen/qwen-2.5-7b-instruct",
        label: "Qwen2.5 7B Instruct",
        free: true,
      },
      { id: "qwen/qwen3-8b", label: "Qwen3 8B", free: true },
      {
        id: "meta-llama/llama-3.3-70b-instruct:free",
        label: "Llama 3.3 70B (free)",
        free: true,
      },
      {
        id: "google/gemma-3-27b-it:free",
        label: "Gemma 3 27B (free)",
        free: true,
      },
    ],
  },
  {
    id: "siliconflow",
    kind: "openai-preset",
    labelKey: "settings.providerSiliconFlow",
    label: "SiliconFlow",
    apiKeyField: "siliconflowApiKey",
    modelField: "siliconflowModel",
    defaultModel: "Qwen/Qwen2.5-7B-Instruct",
    keyPlaceholder: "sk-...",
    baseUrl: "https://api.siliconflow.cn/v1",
    models: [
      {
        id: "Qwen/Qwen2.5-7B-Instruct",
        label: "Qwen2.5 7B Instruct",
        free: true,
      },
      {
        id: "Qwen/Qwen2.5-14B-Instruct",
        label: "Qwen2.5 14B Instruct",
        free: true,
      },
      {
        id: "Qwen/Qwen2.5-72B-Instruct",
        label: "Qwen2.5 72B Instruct",
      },
      {
        id: "deepseek-ai/DeepSeek-V3",
        label: "DeepSeek V3",
      },
      {
        id: "THUDM/glm-4-9b-chat",
        label: "GLM-4 9B Chat",
        free: true,
      },
    ],
  },
  {
    id: "zhipu",
    kind: "openai-preset",
    labelKey: "settings.providerZhipu",
    label: "Zhipu GLM",
    apiKeyField: "zhipuApiKey",
    modelField: "zhipuModel",
    defaultModel: "glm-4-flash",
    keyPlaceholder: "...",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: [
      { id: "glm-4-flash", label: "GLM-4 Flash", free: true },
      { id: "glm-4-flash-250414", label: "GLM-4 Flash 250414", free: true },
      { id: "glm-4.5-flash", label: "GLM-4.5 Flash", free: true },
      { id: "glm-4-air", label: "GLM-4 Air" },
      { id: "glm-4-plus", label: "GLM-4 Plus" },
    ],
  },
  {
    id: "hunyuan",
    kind: "openai-preset",
    labelKey: "settings.providerHunyuan",
    label: "Tencent Hunyuan",
    apiKeyField: "hunyuanApiKey",
    modelField: "hunyuanModel",
    defaultModel: "hunyuan-lite",
    keyPlaceholder: "...",
    baseUrl: "https://api.hunyuan.cloud.tencent.com/v1",
    models: [
      { id: "hunyuan-lite", label: "Hunyuan Lite", free: true },
      { id: "hunyuan-turbos-latest", label: "Hunyuan TurboS" },
      { id: "hunyuan-standard", label: "Hunyuan Standard" },
    ],
  },
  {
    id: "grok",
    kind: "openai-preset",
    labelKey: "settings.providerGrok",
    label: "Groq",
    apiKeyField: "grokApiKey",
    modelField: "grokModel",
    defaultModel: "llama-3.1-8b-instant",
    keyPlaceholder: "gsk_...",
    baseUrl: "https://api.groq.com/openai/v1",
    models: [
      {
        id: "llama-3.1-8b-instant",
        label: "Llama 3.1 8B Instant",
        free: true,
      },
      {
        id: "llama-3.3-70b-versatile",
        label: "Llama 3.3 70B Versatile",
        free: true,
      },
      { id: "gemma2-9b-it", label: "Gemma2 9B IT", free: true },
      {
        id: "mixtral-8x7b-32768",
        label: "Mixtral 8x7B",
        free: true,
      },
    ],
  },
];

/** Full provider list in UI order. */
export const TRANSLATE_PROVIDERS: TranslateProviderDef[] = [
  {
    id: "custom",
    kind: "custom",
    labelKey: "settings.providerCustom",
    label: "Custom (OpenAI / Anthropic)",
    apiKeyField: "llmApiKey",
    modelField: "llmModel",
    defaultModel: "gpt-4o-mini",
  },
  ...OPENAI_PRESET_PROVIDERS,
  {
    id: "gemini",
    kind: "gemini",
    labelKey: "settings.providerGemini",
    label: "Gemini",
    apiKeyField: "geminiApiKey",
    modelField: "geminiModel",
    defaultModel: "gemini-3.5-flash-lite",
    models: [
      {
        id: "gemini-3.5-flash-lite",
        label: "Gemini 3.5 Flash-Lite",
        free: true,
      },
      { id: "gemini-3.8-flash", label: "Gemini 3.8 Flash", free: true },
      { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", free: true },
      { id: "gemini-flash-latest", label: "Gemini Flash (latest)", free: true },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
    ],
  },
];

export function providerById(id: string): TranslateProviderDef | undefined {
  return TRANSLATE_PROVIDERS.find((p) => p.id === id);
}

/** All vault / config API-key field names. */
export function allApiKeyFields(): string[] {
  return TRANSLATE_PROVIDERS.map((p) => p.apiKeyField).filter(
    (f): f is string => !!f,
  );
}
