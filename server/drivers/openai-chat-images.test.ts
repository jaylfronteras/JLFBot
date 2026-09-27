// Image parts on the shared chat-completions wire. Only a model whose catalog
// says it accepts images receives OpenAI image_url content; Grok and MiniMax
// catalogs do not, so their requests stay text.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";

import type { ProviderInstance } from "../contracts.ts";
import { GrokDriver } from "./grok.ts";
import { MinimaxDriver } from "./minimax.ts";
import { OpenAICompatDriver } from "./openai-compat.ts";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function completion(text: string, toolName?: string) {
  return JSON.stringify({
    choices: [{
      index: 0,
      message: toolName
        ? { role: "assistant", content: null, tool_calls: [{ id: "call_screen", type: "function", function: { name: toolName, arguments: "{}" } }] }
        : { role: "assistant", content: text },
      finish_reason: toolName ? "tool_calls" : "stop",
    }],
  });
}

async function listen() {
  const bodies: Array<{ model?: string; messages?: Array<{ role?: string }>; tools?: Array<{ function: { name: string } }> }> = [];
  const server = createServer(async (request, response) => {
    if (request.url?.endsWith("/models")) {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ data: [
        { id: "deepseek-flash", name: "DeepSeek Flash" },
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      ] }));
      return;
    }
    let data = "";
    for await (const part of request) data += part.toString();
    const body = JSON.parse(data) as (typeof bodies)[number];
    bodies.push(body);
    response.setHeader("content-type", "application/json");
    const tool = body.tools?.find((entry) => entry.function.name === "computer_screenshot");
    const followUp = body.messages?.some((message) => message.role === "tool");
    response.end(completion("done", tool && !followUp ? "computer_screenshot" : undefined));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture did not bind");
  return {
    bodies,
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function imageFile() {
  const dir = mkdtempSync(join(tmpdir(), "jlfbot-chat-image-"));
  dirs.push(dir);
  const path = join(dir, "pixel.png");
  writeFileSync(path, Buffer.from(PNG, "base64"));
  return { path, bytes: Buffer.from(PNG, "base64").length };
}

function screenServer() {
  const dir = mkdtempSync(join(tmpdir(), "jlfbot-chat-screen-"));
  dirs.push(dir);
  const script = join(dir, "screen.mjs");
  writeFileSync(script, `#!/usr/bin/env node
    const png = ${JSON.stringify(PNG)};
    const send = (message) => process.stdout.write(JSON.stringify(message) + "\\n");
    let buffer = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf("\\n")) !== -1) {
        const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
        const message = JSON.parse(line);
        if (message.method === "initialize") send({jsonrpc:"2.0",id:message.id,result:{protocolVersion:"2024-11-05",capabilities:{tools:{}}}});
        else if (message.method === "tools/list") send({jsonrpc:"2.0",id:message.id,result:{tools:[{name:"screenshot",description:"Screen",inputSchema:{type:"object",properties:{},additionalProperties:false}}]}});
        else if (message.method === "tools/call") send({jsonrpc:"2.0",id:message.id,result:{content:[{type:"text",text:"desktop"},{type:"image",data:png,mimeType:"image/png"}]}});
      }
    });
  `);
  chmodSync(script, 0o755);
  return { command: script, args: [], env: {} };
}

function untilDone(instance: ProviderInstance, threadId: string) {
  return new Promise<void>((resolve, reject) => {
    let failure = "turn failed";
    const timer = setTimeout(() => reject(new Error("turn timed out")), 10_000);
    const stop = instance.adapter.onEvent((event) => {
      if (event.threadId !== threadId) return;
      if (event.type === "runtime.error" && event.message) failure = event.message;
      if (event.type !== "turn.completed") return;
      clearTimeout(timer);
      stop();
      if (!event.ok) reject(new Error(failure));
      else resolve();
    });
  });
}

describe("OpenAI chat image requests", () => {
  it("sends attachment and screenshot image_url parts only for a marked model", async () => {
    const endpoint = await listen();
    const image = imageFile();
    const instance = await OpenAICompatDriver.create({
      instanceId: "deepseek",
      displayName: "DeepSeek",
      enabled: true,
      config: OpenAICompatDriver.decodeConfig({
        url: `${endpoint.origin}/v1`,
        apiKeyEnv: "TEST_KEY",
        imageModels: ["deepseek-flash"],
      }),
      environment: { TEST_KEY: "secret" },
    });
    try {
      await instance.refreshModels?.();
      expect(instance.models.options.find((model) => model.id === "deepseek-v4-pro")?.images).toBeUndefined();
      const images = [{ path: image.path, mime: "image/png" as const, bytes: image.bytes }];
      const visionDone = untilDone(instance, "vision");
      await instance.adapter.sendTurn({ threadId: "vision", text: "What is this?", model: "deepseek-flash", images });
      await visionDone;
      const vision = endpoint.bodies[0]?.messages?.at(-1) as { content?: unknown };
      expect(vision.content).toEqual([
        { type: "text", text: "What is this?" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
      ]);

      const textDone = untilDone(instance, "text");
      await instance.adapter.sendTurn({ threadId: "text", text: "What is this?", model: "deepseek-v4-pro", images });
      await textDone;
      expect(endpoint.bodies[1]?.messages?.at(-1)).toMatchObject({ content: "What is this?" });
      expect(JSON.stringify(endpoint.bodies[1])).not.toContain("image_url");

      const localComputer = screenServer();
      const screenDone = untilDone(instance, "screen");
      await instance.adapter.sendTurn({
        threadId: "screen",
        text: "Look at the desktop.",
        model: "deepseek-flash",
        approvalMode: "full",
        integrations: { localComputer },
      });
      await screenDone;
      expect(endpoint.bodies[2]?.tools?.map((tool) => tool.function.name)).toContain("computer_screenshot");
      const shot = endpoint.bodies[3]?.messages?.at(-1) as { role?: string; content?: unknown };
      expect(shot.role).toBe("tool");
      expect(shot.content).toEqual([
        { type: "text", text: expect.stringContaining("desktop") },
        { type: "image_url", image_url: { url: `data:image/png;base64,${PNG}` } },
      ]);

      const plainDone = untilDone(instance, "text-screen");
      await instance.adapter.sendTurn({
        threadId: "text-screen",
        text: "Look at the desktop.",
        model: "deepseek-v4-pro",
        approvalMode: "full",
        integrations: { localComputer },
      });
      await plainDone;
      expect(endpoint.bodies.at(-1)?.tools?.map((tool) => tool.function.name) ?? []).not.toContain("computer_screenshot");
    } finally {
      await instance.dispose();
      await endpoint.close();
    }
  }, 20_000);

  it.each(["grok", "minimax"] as const)("keeps %s requests textual when an image is attached", async (provider) => {
    const endpoint = await listen();
    const image = imageFile();
    const instance = provider === "grok"
      ? await GrokDriver.create({
        instanceId: "grok", displayName: "Grok", enabled: true,
        config: { url: `${endpoint.origin}/v1`, apiKeyEnv: "XAI_API_KEY" },
        environment: { XAI_API_KEY: "secret" },
      })
      : await MinimaxDriver.create({
        instanceId: "minimax", displayName: "MiniMax", enabled: true,
        config: { url: `${endpoint.origin}/v1` },
        environment: { MINIMAX_API_KEY: "secret" },
      });
    try {
      expect(instance.adapter.capabilities.images).toBeUndefined();
      expect(instance.adapter.capabilities.computerMcp).toBeUndefined();
      expect(instance.adapter.capabilities.nativeImageInput).toBeUndefined();
      const done = untilDone(instance, provider);
      await instance.adapter.sendTurn({
        threadId: provider,
        text: "What is this?",
        images: [{ path: image.path, mime: "image/png", bytes: image.bytes }],
        integrations: { localComputer: screenServer() },
      });
      await done;
      expect(endpoint.bodies[0]?.messages?.at(-1)).toMatchObject({ content: "What is this?" });
      expect(JSON.stringify(endpoint.bodies[0])).not.toContain("image_url");
      expect(endpoint.bodies[0]?.tools?.map((tool) => tool.function.name) ?? []).not.toContain("computer_screenshot");
    } finally {
      await instance.dispose();
      await endpoint.close();
    }
  }, 20_000);
});
