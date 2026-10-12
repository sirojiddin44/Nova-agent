import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { ClaudeChatModel, toLlmError } from "../src/ai/llm.js";

const headers = new Headers();

describe("toLlmError", () => {
  it.each([
    [new Anthropic.AuthenticationError(401, undefined, "bad key", headers), "auth"],
    [new Anthropic.RateLimitError(429, undefined, "slow down", headers), "rate_limit"],
    [new Anthropic.InternalServerError(529, undefined, "overloaded", headers), "overloaded"],
    [new Anthropic.APIConnectionTimeoutError(), "timeout"],
    [new Anthropic.APIConnectionError({ message: "offline" }), "network"],
    [new Anthropic.BadRequestError(400, undefined, "bad", headers), "other"],
    [new Error("boom"), "other"],
  ])("%s → %s", (err, kind) => {
    expect(toLlmError(err).kind).toBe(kind);
  });
});

// Haqiqiy SDK, lekin tarmoq o'rniga soxta fetch: so'rov tanasini tekshiramiz.
function modelWithFetch(model: string, body: object) {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  const m = new ClaudeChatModel({ provider: "claude", apiKey: "sk-ant-api03-test", model, effort: "low", maxTokens: 4096, timeoutMs: 5000 });
  (m as unknown as { client: Anthropic }).client = new Anthropic({ apiKey: "sk-ant-api03-test", fetch, maxRetries: 0 });
  return { m, requests };
}

const okBody = {
  id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5",
  content: [{ type: "thinking", thinking: "", signature: "x" }, { type: "text", text: " Salom! " }],
  stop_reason: "end_turn", stop_sequence: null,
  usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
};

describe("ClaudeChatModel", () => {
  it("to'g'ri so'rov yuboradi va faqat text bloklarini qaytaradi", async () => {
    const { m, requests } = modelWithFetch("claude-opus-5-5", okBody);
    const out = await m.reply({ system: "SYS", turns: [{ role: "user", text: "salom" }] });
    expect(out).toEqual({ text: "Salom!", inputTokens: 50, outputTokens: 10 });

    const body = requests[0]!.body;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.system).toBe("SYS");
    expect(body.output_config).toEqual({ effort: "low" });
    expect(body.fallbacks).toBe("default");
    expect(body.messages).toEqual([{ role: "user", content: "salom" }]);
    expect(body).not.toHaveProperty("thinking");
  });

  it("rasm oxirgi user xabariga image bloki sifatida qo'shiladi; bo'sh matn bloki yuborilmaydi", async () => {
    const { m, requests } = modelWithFetch("claude-opus-5-5", okBody);
    const image = { mimeType: "image/png" as const, base64: "iVBORw0KGgo=" };
    await m.reply({ system: "S", turns: [{ role: "user", text: "eski" }, { role: "assistant", text: "ok" }, { role: "user", text: "" }], image });
    const messages = requests[0]!.body.messages as Array<{ content: unknown }>;
    expect(messages[0]!.content).toBe("eski");
    expect(messages[2]!.content).toEqual([{ type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgo=" } }]);

    await m.reply({ system: "S", turns: [{ role: "user", text: "Bu nima?" }], image });
    const withCaption = (requests[1]!.body.messages as Array<{ content: Array<{ type: string }> }>)[0]!.content;
    expect(withCaption.map((b) => b.type)).toEqual(["image", "text"]);
  });

  it("fallback qo'llanmaydigan modelda fallbacks yuborilmaydi", async () => {
    const { m, requests } = modelWithFetch("claude-haiku-5-5", okBody);
    await m.reply({ system: "SYS", turns: [{ role: "user", text: "hi" }] });
    expect(requests[0]!.body).not.toHaveProperty("fallbacks");
  });

  it("refusal → LlmError('refusal')", async () => {
    const { m } = modelWithFetch("claude-opus-5-5", {
      ...okBody,
      content: [],
      stop_reason: "refusal",
      stop_details: { type: "refusal", category: "cyber", explanation: null },
    });
    await expect(m.reply({ system: "S", turns: [{ role: "user", text: "x" }] })).rejects.toMatchObject({ kind: "refusal" });
  });
});
