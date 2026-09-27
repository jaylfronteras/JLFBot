// Transcript-replay driver for OpenRouter, Groq, Together, llama.cpp, and
// other endpoints that speak the OpenAI chat-completions contract.
import type { ModelCatalog, ProviderDriver } from "../contracts.ts";
import { createOpenAIChatRuntime } from "./openai-chat.ts";

const DRIVER_KIND = "openai-compat";
const DEFAULT_IDLE_TIMEOUT_MS = 180_000;
const idleTimeoutMs = () => {
  const raw = process.env.JLFBOT_OPENAI_COMPAT_IDLE_TIMEOUT_MS;
  if (!raw) return DEFAULT_IDLE_TIMEOUT_MS;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 1_000 && value <= 2_147_483_647 ? value : DEFAULT_IDLE_TIMEOUT_MS;
};
const DEFAULT_MODELS: ModelCatalog = {
  default: "meta-llama/llama-3.3-70b-instruct",
  options: [
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (OpenRouter)", custom: true },
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq)", custom: true },
  ],
};

export interface OpenAICompatConfig {
  tools?: boolean;
  url: string;
  apiKeyEnv: string;
  key?: string;
  model?: string;
  provider?: string;
  managedModels?: string[];
  /** Model ids that accept images. Absent or empty leaves every model text-only. */
  imageModels?: string[];
}

const MAX_IMAGE_MODELS = 256;

function imageModelIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_IMAGE_MODELS) throw new Error("imageModels must be a list of model ids");
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of value) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200 || id.trim() !== id || /\p{Cc}/u.test(id)) {
      throw new Error("imageModels must be a list of model ids");
    }
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids.length ? ids : undefined;
}

/** Merge a Settings toggle into the saved id list. Ids are explicit: nothing
 * is added because its name looks like a vision model. */
export function mergeImageModels(config: Record<string, unknown>, patch: Record<string, boolean>): Record<string, unknown> {
  const current = imageModelIds(config.imageModels) ?? [];
  const next = new Set(current);
  for (const [id, on] of Object.entries(patch)) {
    if (typeof id !== "string" || id.length === 0 || id.length > 200 || id.trim() !== id || /\p{Cc}/u.test(id)) {
      throw new Error("imageModels must be a list of model ids");
    }
    if (on) next.add(id);
    else next.delete(id);
  }
  if (next.size > MAX_IMAGE_MODELS) throw new Error("Too many models are marked as accepting images.");
  const { imageModels: _previous, ...rest } = config;
  const imageModels = [...next];
  return imageModels.length ? { ...rest, imageModels } : rest;
}

function stampImageModels(options: ModelCatalog["options"], imageModels: readonly string[] | undefined): ModelCatalog["options"] {
  if (!imageModels?.length) return options;
  const ids = new Set(imageModels);
  return options.map((option) => ids.has(option.id) ? { ...option, images: true } : option);
}

function isOpenRouterUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "openrouter.ai" || host.endsWith(".openrouter.ai");
  } catch {
    return false;
  }
}

function decodeConfig(raw: unknown): OpenAICompatConfig {
  const config = (raw ?? {}) as Record<string, unknown>;
  if (config.tools !== undefined && typeof config.tools !== "boolean") throw new Error("tools must be a boolean");
  if (config.managedModels !== undefined && (!Array.isArray(config.managedModels) || !config.managedModels.length || config.managedModels.some(model => typeof model !== "string" || !model.trim()))) throw new Error("Invalid managed models.");
  const imageModels = imageModelIds(config.imageModels);
  const envUrl = process.env.OPENAI_COMPAT_URL;
  return {
    ...(config.tools !== undefined ? { tools: config.tools as boolean } : {}),
    ...(config.managedModels ? { managedModels: config.managedModels as string[] } : {}),
    url: (typeof config.url === "string" && config.url ? config.url : envUrl || "https://openrouter.ai/api/v1")
      .replace(/\/+$/, ""),
    apiKeyEnv: typeof config.apiKeyEnv === "string" && config.apiKeyEnv
      ? config.apiKeyEnv
      : "OPENAI_COMPAT_API_KEY",
    key: typeof config.key === "string" && config.key ? config.key : undefined,
    model: typeof config.model === "string" && config.model
      ? config.model
      : process.env.OPENAI_COMPAT_MODEL || undefined,
    // An explicit empty override disables inherited routing for an isolated
    // connection (CLI setup uses this). Absent still inherits the global pin.
    provider: typeof config.provider === "string"
      ? config.provider || undefined
      : process.env.OPENAI_COMPAT_PROVIDER || undefined,
    ...(imageModels ? { imageModels } : {}),
  };
}

export const OpenAICompatDriver: ProviderDriver<OpenAICompatConfig> = {
  driverKind: DRIVER_KIND,
  metadata: {
    displayName: "OpenAI-compatible (OpenRouter / Groq)",
    supportsMultipleInstances: true,
    access: "custom",
  },
  models: DEFAULT_MODELS,
  install: {
    docsUrl: "https://openrouter.ai/keys",
    signInCommand:
      "add {\"openaiCompat\":{\"key\":\"sk-or-v1-…\"}} to ~/.jlfbot/config.json (or set OPENAI_COMPAT_API_KEY)",
    command: {
      darwin:
        "Get a free key at https://openrouter.ai/keys (or https://console.groq.com) then add it to ~/.jlfbot/config.json under openaiCompat.key",
      linux:
        "Get a free key at https://openrouter.ai/keys (or https://console.groq.com) then add it to ~/.jlfbot/config.json under openaiCompat.key",
      win32:
        "Get a free key at https://openrouter.ai/keys (or https://console.groq.com) then add it to %USERPROFILE%\\.jlfbot\\config.json under openaiCompat.key",
    },
  },
  decodeConfig,
  defaultConfig: () => decodeConfig({}),

  async create(input) {
    const { config } = input;
    const apiKey =
      config.key ??
      input.environment[config.apiKeyEnv] ??
      input.environment.OPENAI_COMPAT_API_KEY ??
      process.env[config.apiKeyEnv] ??
      process.env.OPENAI_COMPAT_API_KEY ??
      "";
    let catalog: ModelCatalog = config.managedModels
      ? { default: config.managedModels[0], options: config.managedModels.map(id => ({ id, label: id })) }
      : config.model
      ? {
          default: config.model,
          options: DEFAULT_MODELS.options.some((model) => model.id === config.model)
            ? DEFAULT_MODELS.options
            : [{ id: config.model, label: config.model, custom: true }, ...DEFAULT_MODELS.options],
        }
      : DEFAULT_MODELS;
    catalog = { ...catalog, options: stampImageModels(catalog.options, config.imageModels) };

    const fetchModels = async () => {
      if (config.managedModels) return;
      if (!apiKey) return;
      try {
        const response = await fetch(`${config.url}/models`, {
          headers: { authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(8_000),
        });
        if (!response.ok) return;
        const json = await response.json() as { data?: Array<{ id?: unknown; name?: unknown }> } | Array<{ id?: unknown; name?: unknown }>;
        const rows = Array.isArray(json) ? json : Array.isArray(json.data) ? json.data : [];
        const seen = new Set<string>();
        const options: ModelCatalog["options"] = [];
        for (const row of rows) {
          const id = typeof row.id === "string" ? row.id : "";
          if (!id || seen.has(id)) continue;
          seen.add(id);
          options.push({
            id,
            label: typeof row.name === "string" && row.name.trim() ? row.name : id,
            custom: true,
          });
        }
        if (!options.length) return;
        if (config.model && !options.some((model) => model.id === config.model)) {
          options.unshift({ id: config.model, label: config.model, custom: true });
        }
        catalog = { default: config.model ?? options[0].id, options: stampImageModels(options, config.imageModels) };
      } catch {
        // Catalog refresh is opportunistic; keep the seeded options.
      }
    };
    if (apiKey) void fetchModels();

    return createOpenAIChatRuntime({
      input,
      driverKind: DRIVER_KIND,
      apiKey,
      apiUrl: config.url,
      tools: config.tools,
      models: () => catalog,
      refreshModels: fetchModels,
      requestBody: (model, messages, stream) => ({
        model,
        messages,
        stream,
        stream_options: stream ? { include_usage: true } : undefined,
        ...(config.provider && isOpenRouterUrl(config.url)
          ? { provider: { order: [config.provider], allow_fallbacks: false } }
          : {}),
      }),
      httpErrorLabel: "upstream",
      missingKeyError: `no API key — set ${config.apiKeyEnv} or add it to the instance config`,
      unavailableReason: `no API key — set ${config.apiKeyEnv} or add it to the instance config`,
      timeoutMs: idleTimeoutMs(),
      reasoning: true,
      billing: "metered",
      includeUsageInCompleted: true,
      nativeLog: {
        source: "openai-compat.chat.completions",
        outgoing: (_turn, messages, model) => ({ model, messageCount: messages.length }),
        incoming: ({ text, reasoning, usage }) => ({
          textLength: text.length,
          reasoningLength: reasoning.length,
          usage,
        }),
      },
    });
  },
};
