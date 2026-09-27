// Isolated harness: a marked OpenAI-compatible model receives image_url parts.
// An unmarked model on the same engine, and Grok, stay text-only.
import { createServer } from "node:http";
import { writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { launchVerificationServer, runControlOmb } from "../scripts/control-jlfbot.ts";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

type ContentPart = { type?: string; text?: string; image_url?: { url?: string } };
type ChatMessage = { role?: string; content?: string | ContentPart[] };

it("sends image_url parts only for a model marked on the custom OpenAI-compatible engine", async () => {
  const requests: Array<{ model?: string; messages?: ChatMessage[] }> = [];
  const upstream = createServer(async (req, res) => {
    if (req.url?.endsWith("/models")) {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ data: [
        { id: "fixture-vision", name: "Fixture vision" },
        { id: "fixture-text", name: "Fixture text" },
      ] }));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body) as (typeof requests)[number]);
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      choices: [{ index: 0, message: { role: "assistant", content: "seen" }, finish_reason: "stop" }],
    }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  if (!address || typeof address === "string") throw new Error("fixture provider address missing");
  const fixture = await launchVerificationServer().catch(async (error) => {
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
    throw error;
  });
  const evidence: unknown[] = [{ fixture: fixture.info }];
  const control = async (args: string[]) => {
    const result = await runControlOmb([...args, "--url", fixture.info.url]) as { success?: boolean; bot?: { id: string; activeTaskId: string }; status?: string };
    evidence.push({ command: args, result });
    return result;
  };
  const api = async (method: string, path: string, body?: unknown, expectedStatus?: number) => {
    const response = await fetch(`${fixture.info.url}${path}`, {
      method,
      headers: { "content-type": "application/json", origin: fixture.info.url },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const result = await response.json() as { instances?: Array<{ instanceId: string; models: { options: Array<{ id: string; images?: boolean }> } }>; error?: string };
    if (expectedStatus !== undefined) expect(response.status, JSON.stringify(result)).toBe(expectedStatus);
    else expect(response.ok, JSON.stringify(result)).toBe(true);
    return result;
  };
  try {
    await api("PATCH", "/api/config", {
      openaiCompat: { key: "synthetic-fixture-key", url: `http://127.0.0.1:${address.port}/v1`, model: "fixture-vision" },
    });
    const marked = await api("PATCH", "/api/instances/openaiCompat", { modelImages: { "fixture-vision": true } });
    const engine = marked.instances?.find((item) => item.instanceId === "openaiCompat");
    expect(engine?.models.options.find((option) => option.id === "fixture-vision")?.images).toBe(true);
    await api("PATCH", "/api/instances/claude", { modelImages: { "fixture-vision": true } }, 400);

    const deadline = Date.now() + 8_000;
    let textModel = false;
    while (Date.now() < deadline && !textModel) {
      const listed = await api("GET", "/api/instances");
      const current = listed.instances?.find((item) => item.instanceId === "openaiCompat");
      textModel = current?.models.options.some((option) => option.id === "fixture-text" && option.images !== true) === true
        && current.models.options.some((option) => option.id === "fixture-vision" && option.images === true) === true;
      if (!textModel) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(textModel).toBe(true);

    const upload = await fetch(`${fixture.info.url}/api/attachments`, {
      method: "POST",
      headers: { "content-type": "image/png", origin: fixture.info.url },
      body: PNG,
    });
    const saved = await upload.json() as { path?: string };
    expect(upload.status, JSON.stringify(saved)).toBe(201);
    expect(saved.path).toBeTruthy();
    const text = `Look at this.\n\n<attached-image path="${saved.path}" name="pixel.png" />`;

    const { bot } = await control(["new-bot", "--name", "Vision fixture"]);
    if (!bot) throw new Error("fixture bot missing");
    await control(["set-model", "--bot", bot.id, "--instance", "openaiCompat", "--model", "fixture-vision"]);
    expect((await control(["send", "--bot", bot.id, "--task", bot.activeTaskId, "--text", text])).success).toBe(true);
    expect((await control(["wait", "--bot", bot.id, "--task", bot.activeTaskId, "--timeout", "20"])).status).toBe("settled");
    const vision = requests.at(-1)?.messages?.find((message) => message.role === "user");
    expect(vision?.content).toEqual([
      { type: "text", text: expect.stringMatching(/^Look at this\.\s*$/) },
      { type: "image_url", image_url: { url: `data:image/png;base64,${PNG.toString("base64")}` } },
    ]);

    await control(["set-model", "--bot", bot.id, "--instance", "openaiCompat", "--model", "fixture-text"]);
    expect((await control(["send", "--bot", bot.id, "--task", bot.activeTaskId, "--text", text])).success).toBe(true);
    expect((await control(["wait", "--bot", bot.id, "--task", bot.activeTaskId, "--timeout", "20"])).status).toBe("settled");
    const plain = requests.at(-1)?.messages?.find((message) => message.role === "user");
    expect(plain?.content).toContain("Look at this.");
    expect(plain?.content).toContain("<attached-image");
    expect(JSON.stringify(requests.at(-1))).not.toContain("image_url");
    evidence.push({ visionRequests: requests.length, markedModel: "fixture-vision" });
  } finally {
    const evidencePath = `${fixture.info.logPath}.openai-vision.json`;
    writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), { mode: 0o600 });
    console.info(JSON.stringify({ evidencePath }));
    await fixture.close();
    upstream.closeAllConnections();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  }
}, 90_000);
