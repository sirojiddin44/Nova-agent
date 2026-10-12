import { ApiError, FinishReason, GoogleGenAI, type Part } from "@google/genai";
import type { LlmConfig } from "../config/env.js";
import { LlmError, type ChatModel, type ChatRequest, type ChatResult } from "./llm.js";

// Google Gemini orqali javob. ChatModel interfeysini bajaradi —
// shuning uchun ChatService qaysi provayder ishlayotganini bilmaydi ham.
export class GeminiChatModel implements ChatModel {
  private readonly client: GoogleGenAI;

  constructor(private readonly config: LlmConfig) {
    this.client = new GoogleGenAI({
      apiKey: config.apiKey,
      httpOptions: { timeout: config.timeoutMs, retryOptions: { attempts: 3 } },
    });
  }

  async reply({ system, turns, image }: ChatRequest): Promise<ChatResult> {
    const last = turns.length - 1;
    const contents = turns.map((t, i) => {
      // Gemini'da assistant roli "model" deb ataladi.
      const role = t.role === "assistant" ? "model" : "user";
      if (i !== last || !image) return { role, parts: [{ text: t.text }] };
      const parts: Part[] = [{ inlineData: { mimeType: image.mimeType, data: image.base64 } }];
      if (t.text) parts.push({ text: t.text });
      return { role, parts };
    });

    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.config.model,
        contents,
        config: { systemInstruction: system, maxOutputTokens: this.config.maxTokens },
      });
    } catch (err) {
      throw toGeminiError(err);
    }

    const blocked = response.promptFeedback?.blockReason;
    const finish = response.candidates?.[0]?.finishReason;
    if (blocked || finish === FinishReason.SAFETY) {
      throw new LlmError("refusal", `Gemini blocked the response (${blocked ?? finish})`);
    }

    const usage = response.usageMetadata;
    return {
      text: (response.text ?? "").trim(),
      inputTokens: usage?.promptTokenCount ?? 0,
      outputTokens: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    };
  }
}

export function toGeminiError(err: unknown): LlmError {
  if (err instanceof ApiError) {
    const s = err.status;
    if (s === 401 || s === 403 || (s === 400 && /api key/i.test(err.message))) return new LlmError("auth", "Gemini API key rejected");
    if (s === 429) return new LlmError("rate_limit", "Gemini rate limit / quota");
    if (s >= 500) return new LlmError("overloaded", `Gemini API error ${s}`);
    return new LlmError("other", `Gemini API error ${s}`);
  }
  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return new LlmError("timeout", "Gemini request timed out");
  }
  if (err instanceof TypeError) return new LlmError("network", "Network error");
  return new LlmError("other", err instanceof Error ? err.message : String(err));
}
