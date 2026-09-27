// Per-model vision for custom OpenAI-compatible engines.
//
// Adapter capabilities are shared by every model on an instance. Image input
// and the computer tools that return screenshots are therefore decided from
// the selected model's catalog flag, which stays off until the owner lists
// that id. Text-only ids such as deepseek-v4-pro are never inferred.
import type { ModelCatalog, ProviderAdapter } from "./contracts.ts";

export interface VisionInstance {
  driverKind: string;
  models: ModelCatalog;
  adapter: { capabilities: ProviderAdapter["capabilities"] };
}

export function catalogModelAcceptsImages(models: ModelCatalog, modelId: string | undefined): boolean {
  return Boolean(modelId && models.options.some((option) => option.id === modelId && option.images === true));
}

/** User images on a custom OpenAI-compatible model. Tool calling is separate:
 * a connection with tools switched off can still read an attached picture. */
export function openAICompatAcceptsImages(instance: VisionInstance, modelId: string | undefined): boolean {
  return instance.driverKind === "openai-compat" && catalogModelAcceptsImages(instance.models, modelId);
}

/** Computer tools need both vision (screenshots) and the engine's tool switch. */
export function openAICompatComputer(instance: VisionInstance, modelId: string | undefined): boolean {
  return openAICompatAcceptsImages(instance, modelId) && instance.adapter.capabilities.agentsMcp === true;
}

export function nativeImageInputFor(instance: VisionInstance, modelId: string | undefined): boolean {
  return instance.adapter.capabilities.nativeImageInput === true || openAICompatAcceptsImages(instance, modelId);
}

export function computerMcpFor(instance: VisionInstance | null | undefined, modelId: string | undefined): boolean {
  if (!instance) return false;
  return instance.adapter.capabilities.computerMcp === true || openAICompatComputer(instance, modelId);
}

export function localComputerMcpFor(instance: VisionInstance | null | undefined, modelId: string | undefined): boolean {
  if (!instance) return false;
  return instance.adapter.capabilities.localComputerMcp === true || openAICompatComputer(instance, modelId);
}
