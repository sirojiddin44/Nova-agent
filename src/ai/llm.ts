import Anthropic from "@anthropic-ai/sdk";
import type { LlmConfig } from "../config/env.js";
import type { ChatTurn } from "../chat/conversationRepo.js";

// Rasm faqat oxirgi (yangi) user xabariga biriktiriladi.
export type ChatImage = { mimeType: SupportedImageType; base64: string };
export type ChatRequest = { system: string; turns: ChatTurn[]; image?: ChatImage };

// Ikkala provayder ham qo'llab-quvvatlaydigan formatlar.
export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function isSupportedImageType(mime: string | undefined): mime is SupportedImageType {
  return (SUPPORTED_IMAGE_TYPES as readonly string[]).includes(mime ?? "");
}
export type ChatResult = { text: string; inputTokens: number; outputTokens: number };

// Boshqa qismlar faqat shu interfeysni biladi. Testda soxta model, ishda Claude.
// Keyin provayder almashtirilsa, faqat shu fayl o'zgaradi.
export interface ChatModel {
  reply(request: ChatRequest): Promise<ChatResult>;
}

export type LlmErrorKind = "rate_limit" | "overloaded" | "auth" | "refusal" | "timeout" | "network" | "other";

export class LlmError extends Error {
  constructor(readonly kind: LlmErrorKind, message: string) {
    super(message);
  }
}

// Server-side fallback ("default" rejimi) qo'llab-quvvatlanadigan modellar.
// Model xavfsizlik sababli rad etsa, API so'rovni o'zi boshqa modelda qayta bajaradi.
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);

export class ClaudeChatModel implements ChatModel {
  private readonly client: Anthropic;

  constructor(private readonly config: LlmConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey, timeout: config.timeoutMs, maxRetries: 2 });
  }

  async reply({ system, turns, image }: ChatRequest): Promise<ChatResult> {
    const useFallback = FALLBACK_MODELS.has(this.config.model);
    const last = turns.length - 1;
    const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t, i) => {
      if (i !== last || !image) return { role: t.role, content: t.text };
      // Oxirgi xabar: avval rasm, keyin (bo'lsa) matn. Bo'sh text blokni API rad etadi.
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        { type: "image", source: { type: "base64", media_type: image.mimeType, data: image.base64 } },
      ];
      if (t.text) content.push({ type: "text", text: t.text });
      return { role: t.role, content };
    });
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client.beta.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        output_config: { effort: this.config.effort },
        system,
        messages,
        ...(useFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      });
    } catch (err) {
      throw toLlmError(err);
    }

    if (response.stop_reason === "refusal") {
      throw new LlmError("refusal", `Model declined (category: ${response.stop_details?.category ?? "unknown"})`);
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return {
      text,
      inputTokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0),
      outputTokens: response.usage.output_tokens,
    };
  }
}

// SDK xatolarini o'zimizning tushunarli turlarimizga aylantiramiz (aniqdan umumiyga).
export function toLlmError(err: unknown): LlmError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new LlmError("auth", "API key rejected");
  }
  if (err instanceof Anthropic.RateLimitError) return new LlmError("rate_limit", "Rate limited");
  if (err instanceof Anthropic.APIConnectionTimeoutError) return new LlmError("timeout", "Request timed out");
  if (err instanceof Anthropic.APIConnectionError) return new LlmError("network", "Network error");
  if (err instanceof Anthropic.APIError) {
    if (err.status === 529 || (err.status ?? 0) >= 500) return new LlmError("overloaded", `API error ${err.status}`);
    return new LlmError("other", `API error ${err.status}`);
  }
  return new LlmError("other", err instanceof Error ? err.message : String(err));
}
