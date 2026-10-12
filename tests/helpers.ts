import type { ChatModel, ChatRequest, ChatResult } from "../src/ai/llm.js";
import type { Config } from "../src/config/env.js";

export const FAKE_TOKEN = "123456789:AAFakeTokenForTestsOnly_abcdefghijklmn";

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    botToken: FAKE_TOKEN,
    ownerId: 1000,
    accessMode: "open",
    databasePath: ":memory:",
    logLevel: "error",
    llm: { provider: "claude", apiKey: "sk-ant-api03-fake", model: "claude-opus-5-5", effort: "low", maxTokens: 4096, timeoutMs: 60_000 },
    limits: { historyLimit: 20, dailyMessagesPerUser: 30, dailyTokenBudget: 300_000 },
    ...overrides,
  };
}

// Soxta AI: so'rovlarni yozib boradi va oldindan berilgan javob (yoki xato) qaytaradi.
export class FakeModel implements ChatModel {
  readonly calls: ChatRequest[] = [];
  private queue: Array<string | Error> = [];

  constructor(private readonly fallback: (req: ChatRequest) => string = (req) => `echo: ${req.turns.at(-1)?.text}`) {}

  willReturn(...items: Array<string | Error>): this {
    this.queue.push(...items);
    return this;
  }

  async reply(request: ChatRequest): Promise<ChatResult> {
    this.calls.push(structuredClone(request));
    const next = this.queue.shift();
    if (next instanceof Error) throw next;
    return { text: next ?? this.fallback(request), inputTokens: 100, outputTokens: 20 };
  }
}
