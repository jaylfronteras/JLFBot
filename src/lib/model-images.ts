// Client mirror of server/openai-vision.ts. Engine-wide capabilities still
// win for Claude, Codex, and ACP. A custom OpenAI-compatible model opts in
// with its own catalog flag, which defaults to off.
import type { InstanceInfo } from "@/state/store";

type VisionInstance = Pick<InstanceInfo, "driverKind" | "capabilities" | "models"> | undefined;

export function modelMarkedForImages(instance: VisionInstance, modelId: string | undefined): boolean {
  return Boolean(modelId && instance?.models.options.some((option) => option.id === modelId && option.images === true));
}

export function responderAcceptsImages(instance: VisionInstance, modelId: string | undefined): boolean {
  if (instance?.capabilities?.images === true) return true;
  return instance?.driverKind === "openai-compat" && modelMarkedForImages(instance, modelId);
}

export function responderComputerTools(instance: VisionInstance, modelId: string | undefined): boolean {
  if (instance?.capabilities?.computerMcp === true) return true;
  return instance?.driverKind === "openai-compat"
    && instance.capabilities?.agentsMcp === true
    && modelMarkedForImages(instance, modelId);
}

/** Host, Local VM, and VPS mounts. An engine that already advertises either
 * computer capability keeps it; a vision model on a custom OpenAI-compatible
 * engine gains both, because those tools return screenshots. */
export function responderLocalComputer(instance: VisionInstance, modelId: string | undefined): boolean {
  return instance?.capabilities?.localComputerMcp === true || responderComputerTools(instance, modelId);
}
