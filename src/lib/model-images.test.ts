import { describe, expect, it } from "vitest";
import type { InstanceInfo } from "@/state/store";
import { responderAcceptsImages, responderComputerTools, responderLocalComputer } from "./model-images";

function instance(partial: Pick<InstanceInfo, "driverKind" | "capabilities" | "models">): InstanceInfo {
  return partial as InstanceInfo;
}

describe("model image support in the client", () => {
  const custom = instance({
    driverKind: "openai-compat",
    capabilities: { agentsMcp: true },
    models: {
      default: "deepseek-flash",
      options: [
        { id: "deepseek-flash", label: "DeepSeek Flash", images: true },
        { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
      ],
    },
  });

  it("accepts images and computer tools only for the marked model", () => {
    expect(responderAcceptsImages(custom, "deepseek-flash")).toBe(true);
    expect(responderComputerTools(custom, "deepseek-flash")).toBe(true);
    expect(responderLocalComputer(custom, "deepseek-flash")).toBe(true);
    expect(responderAcceptsImages(custom, "deepseek-v4-pro")).toBe(false);
    expect(responderComputerTools(custom, "deepseek-v4-pro")).toBe(false);
    expect(responderLocalComputer(custom, "deepseek-v4-pro")).toBe(false);
  });

  it("still pastes images when tool calls are off, without offering a computer", () => {
    const textTools = instance({ ...custom, capabilities: { agentsMcp: false } });
    expect(responderAcceptsImages(textTools, "deepseek-flash")).toBe(true);
    expect(responderComputerTools(textTools, "deepseek-flash")).toBe(false);
  });

  it("leaves Grok on its engine capability", () => {
    const grok = instance({
      driverKind: "grok",
      capabilities: { agentsMcp: true },
      models: { default: "grok-4.7", options: [{ id: "grok-4.7", label: "Grok 4.7" }] },
    });
    expect(responderAcceptsImages(grok, "grok-4.7")).toBe(false);
    expect(responderComputerTools(grok, "grok-4.7")).toBe(false);
  });
});
