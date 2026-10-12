import { z } from "zod";

const intWithDefault = (def: number, min: number) => z.coerce.number().int().min(min).default(def);

// .env qiymatlari qanday bo'lishi kerakligini tasvirlaydi.
// Biror qiymat noto'g'ri bo'lsa, Nova umuman ishga tushmaydi (fail fast).
const envSchema = z.object({
  BOT_TOKEN: z
    .string()
    .regex(/^\d+:[A-Za-z0-9_-]{30,}$/, "BOT_TOKEN formati noto'g'ri (@BotFather'dan ol)"),
  OWNER_TELEGRAM_ID: z.coerce
    .number()
    .int()
    .positive("OWNER_TELEGRAM_ID musbat son bo'lishi kerak"),
  ACCESS_MODE: z.enum(["open", "allowlist"]).default("open"),
  DATABASE_PATH: z.string().min(1).default("./data/nova.db"),
  LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),

  // --- AI ---
  // Ikkala kalit ham bo'sh bo'lsa Nova ishlaydi, lekin AI o'chiq bo'ladi.
  // LLM_PROVIDER bo'sh bo'lsa, qaysi kalit qo'yilgan bo'lsa o'sha ishlatiladi.
  LLM_PROVIDER: z.enum(["", "claude", "gemini"]).default(""),
  ANTHROPIC_API_KEY: z
    .string()
    .trim()
    .refine((v) => v === "" || v.startsWith("sk-ant-api"), "ANTHROPIC_API_KEY 'sk-ant-api' bilan boshlanishi kerak (Console'dan olingan API kalit)")
    .default(""),
  LLM_MODEL: z.string().trim().min(1).default("claude-opus-5-5"),
  GEMINI_API_KEY: z
    .string()
    .trim()
    // Eski format: "AIza...", yangi format: "AQ.Ab..." (nuqta bilan).
    .refine((v) => v === "" || /^[A-Za-z0-9_.-]{20,}$/.test(v), "GEMINI_API_KEY noto'g'ri ko'rinishda (aistudio.google.com'dan to'liq nusxala)")
    .default(""),
  GEMINI_MODEL: z.string().trim().min(1).default("gemini-3.5-flash-lite"),
  LLM_EFFORT: z.enum(["low", "medium", "high", "xhigh", "max"]).default("low"),
  LLM_MAX_TOKENS: intWithDefault(4096, 256),
  LLM_TIMEOUT_SECONDS: intWithDefault(60, 5),
  HISTORY_LIMIT: intWithDefault(20, 2),
  // Owner'dan boshqa har bir foydalanuvchi uchun kunlik xabar limiti.
  DAILY_MESSAGES_PER_USER: intWithDefault(30, 1),
  // Hamma foydalanuvchilar uchun umumiy kunlik token byudjeti (input + output).
  DAILY_TOKEN_BUDGET: intWithDefault(300_000, 1000),
});

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type LlmProvider = "claude" | "gemini";

export type LlmConfig = {
  provider: LlmProvider | null; // null = AI o'chiq
  apiKey: string;
  model: string;
  effort: Effort;
  maxTokens: number;
  timeoutMs: number;
};

export type LimitsConfig = {
  historyLimit: number;
  dailyMessagesPerUser: number;
  dailyTokenBudget: number;
};

export type Config = {
  botToken: string;
  ownerId: number;
  accessMode: "open" | "allowlist";
  databasePath: string;
  logLevel: "trace" | "debug" | "info" | "warn" | "error";
  llm: LlmConfig;
  limits: LimitsConfig;
};

export class ConfigError extends Error {}

// process.env'ni parametr sifatida oladi — shuning uchun testda soxta env berish oson.
export function loadConfig(env: Record<string, string | undefined>): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    // Xato xabarida qiymatlarni emas, faqat maydon nomlarini ko'rsatamiz (token sizib chiqmasin).
    const problems = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new ConfigError(`.env sozlamalarida xato:\n${problems}`);
  }
  const e = result.data;
  const provider = resolveProvider(e.LLM_PROVIDER, e.ANTHROPIC_API_KEY, e.GEMINI_API_KEY);
  return {
    botToken: e.BOT_TOKEN,
    ownerId: e.OWNER_TELEGRAM_ID,
    accessMode: e.ACCESS_MODE,
    databasePath: e.DATABASE_PATH,
    logLevel: e.LOG_LEVEL,
    llm: {
      provider,
      apiKey: provider === "gemini" ? e.GEMINI_API_KEY : provider === "claude" ? e.ANTHROPIC_API_KEY : "",
      model: provider === "gemini" ? e.GEMINI_MODEL : e.LLM_MODEL,
      effort: e.LLM_EFFORT,
      maxTokens: e.LLM_MAX_TOKENS,
      timeoutMs: e.LLM_TIMEOUT_SECONDS * 1000,
    },
    limits: {
      historyLimit: e.HISTORY_LIMIT,
      dailyMessagesPerUser: e.DAILY_MESSAGES_PER_USER,
      dailyTokenBudget: e.DAILY_TOKEN_BUDGET,
    },
  };
}

function resolveProvider(choice: "" | LlmProvider, claudeKey: string, geminiKey: string): LlmProvider | null {
  if (choice === "claude" && !claudeKey) throw new ConfigError("LLM_PROVIDER=claude, lekin ANTHROPIC_API_KEY bo'sh");
  if (choice === "gemini" && !geminiKey) throw new ConfigError("LLM_PROVIDER=gemini, lekin GEMINI_API_KEY bo'sh");
  if (choice) return choice;
  if (claudeKey && geminiKey) {
    throw new ConfigError("Ikkala kalit ham qo'yilgan. Qaysi birini ishlatishni tanlang: LLM_PROVIDER=claude yoki LLM_PROVIDER=gemini");
  }
  if (geminiKey) return "gemini";
  if (claudeKey) return "claude";
  return null;
}
