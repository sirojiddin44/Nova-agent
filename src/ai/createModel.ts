import type { LlmConfig } from "../config/env.js";
import { ClaudeChatModel, type ChatModel } from "./llm.js";
import { GeminiChatModel } from "./gemini.js";

// .env'ga qarab kerakli AI'ni yaratadi. null = kalit yo'q, AI o'chiq.
export function createChatModel(config: LlmConfig): ChatModel | null {
  switch (config.provider) {
    case "claude":
      return new ClaudeChatModel(config);
    case "gemini":
      return new GeminiChatModel(config);
    default:
      return null;
  }
}

export const PROVIDER_LABELS = { claude: "Anthropic Claude", gemini: "Google Gemini" } as const;
