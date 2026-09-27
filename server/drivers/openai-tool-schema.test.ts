// Realistic computer-tool schema: cua-driver's click/browser_prepare shape
// plus the keywords that abort Ajv and that DeepSeek's tool-call subset rejects.
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv } from "ajv";
import formats from "ajv-formats";
import { afterEach, describe, expect, it } from "vitest";

import { mountChatTools, type ChatToolSession } from "./chat-mcp-tools.ts";
import { GrokDriver } from "./grok.ts";
import { OpenAICompatDriver } from "./openai-compat.ts";
import { openAICompatToolSchema } from "./openai-tool-schema.ts";

const COMPUTER_TOOLS = {
  type: "object",
  $schema: "http://json-schema.org/draft-07/schema#",
  additionalProperties: false,
  unevaluatedProperties: false,
  required: [],
  properties: {
    pid: { type: "integer", format: "int32", description: "Target process ID for window scope." },
    capture_id: { type: "string", minLength: 1, description: "Optional capture ID." },
    snapshot_id: { type: "string", pattern: "^s[0-9a-f]{8}$", description: "Snapshot handle." },
    count: { type: "integer", minimum: 1, maximum: 3, description: "Click count." },
    scope: { type: "string", enum: ["window", "desktop"], default: "window" },
    modifier: { type: "array", items: { type: "string" }, minItems: 0, maxItems: 4 },
    profile: { $ref: "#/$defs/profile" },
    button: {
      oneOf: [
        { type: "string", enum: ["left", "right", "middle"] },
        { type: "integer", enum: [1, 2, 3] },
      ],
    },
    pair: { type: "array", prefixItems: [{ type: "string" }, { type: "integer" }] },
    allow_launch: { const: true },
  },
  anyOf: [
    { required: ["pid"] },
    { required: ["allow_launch", "profile"] },
  ],
  $defs: {
    profile: {
      type: "object",
      additionalProperties: false,
      properties: {
        mode: { type: "string", enum: ["isolated_new", "isolated_named"] },
        name: { type: "string", description: "Required only for isolated_named." },
      },
      required: ["mode"],
    },
  },
};

function compile(schema: unknown): void {
  const ajv = new Ajv({
    strict: true, allErrors: false, coerceTypes: false, useDefaults: false,
    removeAdditional: false, validateFormats: true, ownProperties: true, logger: false,
    strictRequired: false, strictTypes: false, strictTuples: false,
  });
  formats.default(ajv);
  ajv.compile(schema as object);
}

describe("openAICompatToolSchema", () => {
  it("inlines a computer-tool schema into the DeepSeek tool subset", () => {
    const original = structuredClone(COMPUTER_TOOLS);
    const safe = openAICompatToolSchema(COMPUTER_TOOLS);
    expect(COMPUTER_TOOLS).toEqual(original);

    expect(safe.type).toBe("object");
    expect(safe).not.toHaveProperty("anyOf");
    expect(safe).not.toHaveProperty("$defs");
    expect(safe).not.toHaveProperty("$schema");
    expect(safe).not.toHaveProperty("unevaluatedProperties");
    expect(JSON.stringify(safe)).not.toContain("$ref");
    expect(JSON.stringify(safe)).not.toContain("minLength");
    expect(JSON.stringify(safe)).not.toContain("minItems");
    expect(JSON.stringify(safe)).not.toContain("prefixItems");
    expect(JSON.stringify(safe)).not.toContain("oneOf");
    expect(JSON.stringify(safe)).not.toContain("int32");
    expect(JSON.stringify(safe)).not.toContain('"const":true');

    const properties = safe.properties as Record<string, Record<string, unknown>>;
    expect(properties.pid).toMatchObject({ type: "integer", description: "Target process ID for window scope." });
    expect(properties.snapshot_id).toMatchObject({ type: "string", pattern: "^s[0-9a-f]{8}$" });
    expect(properties.count).toMatchObject({ minimum: 1, maximum: 3 });
    expect(properties.scope).toMatchObject({ enum: ["window", "desktop"], default: "window" });
    expect(properties.profile).toMatchObject({
      type: "object",
      required: ["mode"],
      properties: { mode: { type: "string", enum: ["isolated_new", "isolated_named"] } },
    });
    expect(properties.button).toHaveProperty("anyOf");
    expect(properties.pair).toMatchObject({
      type: "array",
      items: { anyOf: [{ type: "string" }, { type: "integer" }] },
    });
    // pid is not required by every root choice, so it stays optional.
    expect(safe.required).toBeUndefined();
    expect(() => compile(COMPUTER_TOOLS)).toThrow(/unevaluatedProperties|could not|strict mode/);
    expect(() => compile(safe)).not.toThrow();
  });
});

const dirs: string[] = [];
const sessions: ChatToolSession[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function computerServer() {
  const dir = mkdtempSync(join(tmpdir(), "jlfbot-computer-schema-"));
  dirs.push(dir);
  const script = join(dir, "computer.mjs");
  writeFileSync(script, `#!/usr/bin/env node
    const schema = ${JSON.stringify(COMPUTER_TOOLS)};
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
        else if (message.method === "tools/list") send({jsonrpc:"2.0",id:message.id,result:{tools:[{name:"click",description:"Click",inputSchema:schema}]}});
        else if (message.method === "tools/call") send({jsonrpc:"2.0",id:message.id,result:{content:[{type:"text",text:"clicked"}]}});
      }
    });
  `);
  chmodSync(script, 0o755);
  return { command: script, args: [], env: {} };
}

describe("openai-compat computer tool mounting", () => {
  it("mounts the computer schema only after sanitizing it", async () => {
    const raw = new AbortController();
    await expect(mountChatTools({ custom: { computer: computerServer() } }, raw.signal)).rejects.toThrow(
      "MCP tool schema could not be validated",
    );
    raw.abort();

    const signal = new AbortController();
    const session = await mountChatTools({ custom: { computer: computerServer() } }, signal.signal, { sanitizeSchemas: true });
    sessions.push(session);
    const parameters = session.definitions[0]?.function.parameters as Record<string, unknown>;
    expect(JSON.stringify(parameters)).not.toContain("unevaluatedProperties");
    expect(JSON.stringify(parameters)).not.toContain("$ref");
    expect(() => session.validate("computer_click", { snapshot_id: "s0123abcd", count: 1 })).not.toThrow();
    expect(() => session.validate("computer_click", { count: 9 })).toThrow(/input schema/);
    await expect(session.execute("computer_click", { snapshot_id: "s0123abcd" }, signal.signal)).resolves.toMatchObject({ ok: true, text: "clicked" });
    signal.abort();
  });

  it("sends the sanitized schema from openai-compat and leaves Grok on the raw schema", async () => {
    const bodies: Array<{ tools?: Array<{ function: { parameters: unknown } }> }> = [];
    const endpoint = createServer(async (request, response) => {
      if (request.url?.endsWith("/models")) {
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ data: [{ id: "deepseek-flash" }] }));
        return;
      }
      let data = "";
      for await (const part of request) data += part.toString();
      bodies.push(JSON.parse(data) as (typeof bodies)[number]);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ choices: [{ index: 0, message: { role: "assistant", content: "done" }, finish_reason: "stop" }] }));
    });
    await new Promise<void>((resolve) => endpoint.listen(0, "127.0.0.1", resolve));
    const address = endpoint.address();
    if (!address || typeof address === "string") throw new Error("fixture did not bind");
    const origin = `http://127.0.0.1:${address.port}`;
    const compat = await OpenAICompatDriver.create({
      instanceId: "deepseek", displayName: "DeepSeek", enabled: true,
      config: OpenAICompatDriver.decodeConfig({ url: `${origin}/v1`, apiKeyEnv: "TEST_KEY", model: "deepseek-flash" }),
      environment: { TEST_KEY: "secret" },
    });
    const grok = await GrokDriver.create({
      instanceId: "grok", displayName: "Grok", enabled: true,
      config: { url: `${origin}/v1`, apiKeyEnv: "XAI_API_KEY" },
      environment: { XAI_API_KEY: "secret" },
    });
    const done = (instance: { adapter: { onEvent: (listener: (event: { threadId?: string; type: string; ok?: boolean; message?: string }) => void) => () => void } }, threadId: string) => new Promise<void>((resolve, reject) => {
      let failure = "turn failed";
      const timer = setTimeout(() => reject(new Error("turn timed out")), 10_000);
      const stop = instance.adapter.onEvent((event) => {
        if (event.threadId !== threadId) return;
        if (event.type === "runtime.error" && event.message) failure = event.message;
        if (event.type !== "turn.completed") return;
        clearTimeout(timer);
        stop();
        if (event.ok) resolve();
        else reject(new Error(failure));
      });
    });
    try {
      const compatDone = done(compat, "compat");
      await compat.adapter.sendTurn({
        threadId: "compat", text: "Open the page.", model: "deepseek-flash", approvalMode: "full",
        integrations: { custom: { computer: computerServer() } },
      });
      await compatDone;
      const sent = JSON.stringify(bodies[0]?.tools?.[0]?.function.parameters);
      expect(sent).toContain("snapshot_id");
      expect(sent).not.toContain("unevaluatedProperties");
      expect(sent).not.toContain("$ref");
      expect(sent).not.toContain("minLength");
      expect(sent).not.toContain("int32");

      const grokDone = done(grok, "grok");
      await grok.adapter.sendTurn({
        threadId: "grok", text: "Open the page.", approvalMode: "full",
        integrations: { custom: { computer: computerServer() } },
      });
      await expect(grokDone).rejects.toThrow("MCP tool schema could not be validated");
      expect(bodies).toHaveLength(1);
    } finally {
      await Promise.all(sessions.splice(0).map((session) => session.close()));
      await compat.dispose();
      await grok.dispose();
      endpoint.closeAllConnections();
      await new Promise<void>((resolve) => endpoint.close(() => resolve()));
    }
  }, 20_000);
});
