import { describe, expect, it } from "vitest";
import { ConfigError, loadConfig } from "../src/config/env.js";

const TOKEN = "123456789:AAFakeTokenForTestsOnly_abcdefghijklmn";

describe("loadConfig", () => {
  it("to'g'ri .env'ni o'qiydi va default qiymatlarni qo'yadi", () => {
    const config = loadConfig({ BOT_TOKEN: TOKEN, OWNER_TELEGRAM_ID: "42" });
    expect(config.ownerId).toBe(42);
    expect(config.accessMode).toBe("open");
    expect(config.databasePath).toBe("./data/nova.db");
  });

  it("BOT_TOKEN bo'lmasa xato beradi", () => {
    expect(() => loadConfig({ OWNER_TELEGRAM_ID: "42" })).toThrow(ConfigError);
  });

  it("OWNER_TELEGRAM_ID son bo'lmasa xato beradi", () => {
    expect(() => loadConfig({ BOT_TOKEN: TOKEN, OWNER_TELEGRAM_ID: "@sirojiddin" })).toThrow(ConfigError);
  });

  it("AI sozlamalarining standart qiymatlari: kalit bo'sh (AI o'chiq), opus-5-5, effort low", () => {
    const config = loadConfig({ BOT_TOKEN: TOKEN, OWNER_TELEGRAM_ID: "42" });
    expect(config.llm).toMatchObject({ apiKey: "", model: "claude-opus-5-5", effort: "low", timeoutMs: 60_000 });
    expect(config.limits).toEqual({ historyLimit: 20, dailyMessagesPerUser: 30, dailyTokenBudget: 300_000 });
  });

  describe("AI provider tanlash", () => {
    const base = { BOT_TOKEN: TOKEN, OWNER_TELEGRAM_ID: "42" };
    const GEMINI = "AIzaFakeKeyForTestsOnly_1234567890abc";
    const CLAUDE = "sk-ant-api03-fakekey";

    it("kalit yo'q → AI o'chiq", () => {
      expect(loadConfig(base).llm.provider).toBeNull();
    });

    it("faqat Gemini kaliti → gemini va GEMINI_MODEL ishlatiladi", () => {
      const { llm } = loadConfig({ ...base, GEMINI_API_KEY: GEMINI, LLM_MODEL: "claude-opus-5-5" });
      expect(llm).toMatchObject({ provider: "gemini", apiKey: GEMINI, model: "gemini-3.5-flash-lite" });
    });

    it("yangi formatdagi Google kaliti (AQ. bilan, nuqtali) qabul qilinadi", () => {
      const key = "AQ.AbFakeNewFormatKey_1234567890.abcdef";
      expect(loadConfig({ ...base, GEMINI_API_KEY: key }).llm).toMatchObject({ provider: "gemini", apiKey: key });
    });

    it("faqat Claude kaliti → claude", () => {
      const { llm } = loadConfig({ ...base, ANTHROPIC_API_KEY: CLAUDE });
      expect(llm).toMatchObject({ provider: "claude", apiKey: CLAUDE, model: "claude-opus-5-5" });
    });

    it("ikkala kalit, tanlov yo'q → aniq xato; LLM_PROVIDER bilan → tanlangani", () => {
      expect(() => loadConfig({ ...base, GEMINI_API_KEY: GEMINI, ANTHROPIC_API_KEY: CLAUDE })).toThrow(/LLM_PROVIDER/);
      expect(loadConfig({ ...base, GEMINI_API_KEY: GEMINI, ANTHROPIC_API_KEY: CLAUDE, LLM_PROVIDER: "claude" }).llm.provider).toBe("claude");
    });

    it("LLM_PROVIDER=gemini, lekin kalit bo'sh → xato", () => {
      expect(() => loadConfig({ ...base, LLM_PROVIDER: "gemini" })).toThrow(/GEMINI_API_KEY/);
    });

    it("Gemini kalit maydonidagi axlat (masalan '/') rad etiladi va xatoda ko'rinmaydi", () => {
      try {
        loadConfig({ ...base, GEMINI_API_KEY: "/" });
        expect.unreachable();
      } catch (err) {
        expect((err as Error).message).toContain("GEMINI_API_KEY");
      }
    });
  });

  it("noto'g'ri API kalit rad etiladi va xatoda ko'rinmaydi", () => {
    const badKey = "sk-ant-oat01-subscriptionTokenNotAllowedHere";
    try {
      loadConfig({ BOT_TOKEN: TOKEN, OWNER_TELEGRAM_ID: "42", ANTHROPIC_API_KEY: badKey });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as Error).message).toContain("ANTHROPIC_API_KEY");
      expect((err as Error).message).not.toContain(badKey);
    }
  });

  it(".env.example'ning o'zi xatosiz o'qiladi", async () => {
    const { readFileSync } = await import("node:fs");
    const env = Object.fromEntries(
      readFileSync(".env.example", "utf8")
        .split(/\r?\n/)
        .filter((l) => l && !l.startsWith("#"))
        .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
    );
    expect(() => loadConfig(env)).not.toThrow();
  });

  it("xato xabarida token qiymati ko'rinmaydi", () => {
    try {
      loadConfig({ BOT_TOKEN: TOKEN, OWNER_TELEGRAM_ID: "abc" });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain(TOKEN);
    }
  });
});
