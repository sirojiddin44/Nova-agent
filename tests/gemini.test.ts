import { ApiError } from "@google/genai";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiChatModel, toGeminiError } from "../src/ai/gemini.js";
import { createChatModel } from "../src/ai/createModel.js";
import { ClaudeChatModel } from "../src/ai/llm.js";
import type { LlmConfig } from "../src/config/env.js";

const config: LlmConfig = {
  provider: "gemini",
  apiKey: "AIzaFakeKeyForTestsOnly_1234567890abc",
  model: "gemini-3.8-flash",
  effort: "low",
  maxTokens: 4096,
  timeoutMs: 5000,
};

// Tarmoq o'rniga soxta fetch: so'rov tanasini tekshiramiz, tayyor javob qaytaramiz.
function stubFetch(body: object, status = 200) {
  const requests: Array<{ url: string; body: Record<string, any> }> = [];
  vi.stubGlobal("fetch", async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

const okBody = {
  candidates: [{ content: { role: "model", parts: [{ text: " Salom, bro! " }] }, finishReason: "STOP" }],
  usageMetadata: { promptTokenCount: 40, candidatesTokenCount: 8, thoughtsTokenCount: 12, totalTokenCount: 60 },
};

describe("GeminiChatModel", () => {
  it("to'g'ri so'rov yuboradi: rollar, system prompt, model", async () => {
    const requests = stubFetch(okBody);
    const out = await new GeminiChatModel(config).reply({
      system: "SYS",
      turns: [
        { role: "user", text: "salom" },
        { role: "assistant", text: "va alaykum" },
        { role: "user", text: "qalesan" },
      ],
    });
    expect(out).toEqual({ text: "Salom, bro!", inputTokens: 40, outputTokens: 20 });

    const req = requests[0]!;
    expect(req.url).toContain("gemini-3.8-flash");
    expect(req.body.contents.map((c: any) => c.role)).toEqual(["user", "model", "user"]);
    expect(req.body.contents[2].parts[0].text).toBe("qalesan");
    expect(JSON.stringify(req.body.systemInstruction)).toContain("SYS");
    expect(req.body.generationConfig.maxOutputTokens).toBe(4096);
    // Kalit so'rov tanasiga tushmaydi (u header'da ketadi).
    expect(JSON.stringify(req.body)).not.toContain(config.apiKey);
  });

  it("rasm inlineData sifatida oxirgi user xabariga qo'shiladi", async () => {
    const requests = stubFetch(okBody);
    await new GeminiChatModel(config).reply({
      system: "S",
      turns: [{ role: "user", text: "Bu nima?" }],
      image: { mimeType: "image/jpeg", base64: "/9j/AAAA" },
    });
    expect(requests[0]!.body.contents[0].parts).toEqual([{ inlineData: { mimeType: "image/jpeg", data: "/9j/AAAA" } }, { text: "Bu nima?" }]);
  });

  it("xavfsizlik bloki → refusal", async () => {
    stubFetch({ candidates: [], promptFeedback: { blockReason: "SAFETY" } });
    await expect(new GeminiChatModel(config).reply({ system: "S", turns: [{ role: "user", text: "x" }] })).rejects.toMatchObject({
      kind: "refusal",
    });
  });

  it("noto'g'ri kalit → auth xatosi", async () => {
    stubFetch({ error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } }, 400);
    await expect(new GeminiChatModel(config).reply({ system: "S", turns: [{ role: "user", text: "x" }] })).rejects.toMatchObject({
      kind: "auth",
    });
  });
});

describe("toGeminiError", () => {
  it.each([
    [new ApiError({ message: "quota", status: 429 }), "rate_limit"],
    [new ApiError({ message: "forbidden", status: 403 }), "auth"],
    [new ApiError({ message: "unavailable", status: 503 }), "overloaded"],
    [new ApiError({ message: "bad", status: 400 }), "other"],
    [Object.assign(new Error("aborted"), { name: "AbortError" }), "timeout"],
    [new TypeError("fetch failed"), "network"],
  ])("%s → %s", (err, kind) => {
    expect(toGeminiError(err).kind).toBe(kind);
  });
});

describe("createChatModel", () => {
  it("provider'ga qarab to'g'ri modelni yaratadi", () => {
    expect(createChatModel(config)).toBeInstanceOf(GeminiChatModel);
    expect(createChatModel({ ...config, provider: "claude", apiKey: "sk-ant-api03-x" })).toBeInstanceOf(ClaudeChatModel);
    expect(createChatModel({ ...config, provider: null })).toBeNull();
  });
});
