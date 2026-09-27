import { describe, expect, it } from "vitest";
import type { ModelCatalog, ProviderAdapter } from "./contracts.ts";
import {
  catalogModelAcceptsImages,
  computerMcpFor,
  localComputerMcpFor,
  nativeImageInputFor,
  type VisionInstance,
} from "./openai-vision.ts";

const catalog = (ids: Array<{ id: string; images?: boolean }>): ModelCatalog => ({
  default: ids[0]?.id ?? "",
  options: ids.map((option) => ({ id: option.id, label: option.id, ...(option.images ? { images: true } : {}) })),
});

function instance(
  driverKind: string,
  models: ModelCatalog,
  capabilities: Partial<ProviderAdapter["capabilities"]> = {},
): VisionInstance {
  return { driverKind, models, adapter: { capabilities: { ...capabilities, sessionModelSwitch: "in-session" } } };
}

describe("custom OpenAI-compatible vision", () => {
  const models = catalog([
    { id: "deepseek-flash", images: true },
    { id: "deepseek-v4-pro" },
  ]);

  it("leaves text-only models, including deepseek-v4-pro, without images or a computer", () => {
    const engine = instance("openai-compat", models, { agentsMcp: true });
    expect(catalogModelAcceptsImages(models, "deepseek-v4-pro")).toBe(false);
    expect(catalogModelAcceptsImages(models, "deepseek-flash")).toBe(true);
    expect(nativeImageInputFor(engine, "deepseek-v4-pro")).toBe(false);
    expect(computerMcpFor(engine, "deepseek-v4-pro")).toBe(false);
    expect(localComputerMcpFor(engine, "deepseek-v4-pro")).toBe(false);
    expect(nativeImageInputFor(engine, "deepseek-flash")).toBe(true);
    expect(computerMcpFor(engine, "deepseek-flash")).toBe(true);
    expect(localComputerMcpFor(engine, "deepseek-flash")).toBe(true);
  });

  it("does not grant a computer when tool calls are switched off", () => {
    const engine = instance("openai-compat", models, { agentsMcp: false });
    expect(nativeImageInputFor(engine, "deepseek-flash")).toBe(true);
    expect(computerMcpFor(engine, "deepseek-flash")).toBe(false);
    expect(localComputerMcpFor(engine, "deepseek-flash")).toBe(false);
  });

  it("does not change Grok or MiniMax when no model is marked", () => {
    for (const driverKind of ["grok", "minimax"]) {
      const engine = instance(driverKind, catalog([{ id: "grok-4.7" }, { id: "MiniMax-M3" }]), { agentsMcp: true });
      expect(nativeImageInputFor(engine, "grok-4.7")).toBe(false);
      expect(computerMcpFor(engine, "MiniMax-M3")).toBe(false);
      expect(localComputerMcpFor(engine, "grok-4.7")).toBe(false);
    }
  });

  it("keeps an engine that already declares computer tools", () => {
    const claude = instance("claudeAgent", catalog([{ id: "sonnet" }]), { computerMcp: true, localComputerMcp: true, nativeImageInput: true });
    expect(nativeImageInputFor(claude, "sonnet")).toBe(true);
    expect(computerMcpFor(claude, "sonnet")).toBe(true);
    expect(localComputerMcpFor(claude, "sonnet")).toBe(true);
  });
});
