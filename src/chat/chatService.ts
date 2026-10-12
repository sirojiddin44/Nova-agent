import type { Logger } from "pino";
import type { LimitsConfig } from "../config/env.js";
import type { Role } from "../auth/roles.js";
import { LlmError, type ChatImage, type ChatModel } from "../ai/llm.js";
import { detectLanguage, type Language } from "../ai/language.js";
import { buildSystemPrompt } from "../ai/prompts.js";
import type { ChatTurn, ConversationRepo } from "./conversationRepo.js";
import { dayKey, type UsageRepo } from "./usageRepo.js";

export type ChatOutcome =
  | { kind: "reply"; text: string }
  | { kind: "ai_disabled" | "user_limit" | "budget" | "error"; text: string };

type Deps = {
  model: ChatModel | null; // null = API kalit yo'q, AI o'chiq
  conversations: ConversationRepo;
  usage: UsageRepo;
  limits: LimitsConfig;
  logger: Logger;
  now?: () => Date;
};

// Foydalanuvchiga ko'rinadigan xabarlar (uch tilda).
const MESSAGES: Record<"ai_disabled" | "user_limit" | "budget" | "error" | "busy", Record<"uz" | "ru" | "en", string>> = {
  ai_disabled: {
    uz: "Xabaringizni oldim ✨ AI miyam hozircha ulanmagan, tez orada javob bera olaman!",
    ru: "Сообщение получила ✨ Мой AI пока не подключён, скоро смогу отвечать!",
    en: "Got your message ✨ My AI brain isn't connected yet — I'll be able to answer soon!",
  },
  user_limit: {
    uz: "Bugungi xabarlar limiti tugadi 😅 Ertaga yana gaplashamiz!",
    ru: "Дневной лимит сообщений исчерпан 😅 Поговорим завтра!",
    en: "You've hit today's message limit 😅 Let's talk again tomorrow!",
  },
  budget: {
    uz: "Nova bugun juda ko'p gaplashdi va dam olyapti 😴 Ertaga qaytib keling!",
    ru: "Nova сегодня много болтала и отдыхает 😴 Возвращайтесь завтра!",
    en: "Nova has talked a lot today and is resting 😴 Come back tomorrow!",
  },
  error: {
    uz: "Hozir javob bera olmayapman, birozdan keyin qayta yozib ko'ring 🙏",
    ru: "Сейчас не могу ответить, попробуйте чуть позже 🙏",
    en: "I can't answer right now, please try again in a bit 🙏",
  },
  busy: {
    uz: "Bir daqiqa, juda ko'p odam yozyapti. Birozdan keyin qayta urinib ko'ring 🙏",
    ru: "Секунду, сейчас много сообщений. Попробуйте чуть позже 🙏",
    en: "One moment, lots of people are writing. Please try again shortly 🙏",
  },
};

function pick(key: keyof typeof MESSAGES, lang: Language | null): string {
  const short = lang === "ru" ? "ru" : lang === "en" ? "en" : "uz";
  return MESSAGES[key][short];
}

export class ChatService {
  private readonly now: () => Date;
  // Bir foydalanuvchining xabarlari navbat bilan ishlanadi (tarix aralashmasin).
  private readonly queues = new Map<number, Promise<unknown>>();

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? (() => new Date());
  }

  // image — ixtiyoriy rasm. text bo'sh bo'lishi mumkin (izohsiz rasm).
  handle(userId: number, role: Role, text: string, image?: ChatImage): Promise<ChatOutcome> {
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(() => this.process(userId, role, text, image));
    this.queues.set(userId, next);
    void next.finally(() => {
      if (this.queues.get(userId) === next) this.queues.delete(userId);
    });
    return next;
  }

  clearHistory(userId: number): number {
    return this.deps.conversations.clear(userId);
  }

  private async process(userId: number, role: Role, text: string, image?: ChatImage): Promise<ChatOutcome> {
    const { model, conversations, usage, limits, logger } = this.deps;
    const history = conversations.recent(userId, limits.historyLimit - 1);
    // Izohsiz rasmda til yo'q — shu odamning oldingi xabarlaridan olamiz.
    const lang = detectLanguage(text) ?? lastUserLanguage(history);
    const day = dayKey(this.now());

    if (!model) return { kind: "ai_disabled", text: pick("ai_disabled", lang) };

    // 1) Limitlar — AI'ga pul sarflashdan OLDIN tekshiriladi.
    if (role !== "OWNER" && usage.forUser(userId, day).messageCount >= limits.dailyMessagesPerUser) {
      return { kind: "user_limit", text: pick("user_limit", lang) };
    }
    if (usage.totalTokens(day) >= limits.dailyTokenBudget) {
      logger.warn({ day }, "Daily token budget exhausted");
      return { kind: "budget", text: pick("budget", lang) };
    }

    // 2) Kontekst: FAQAT shu foydalanuvchining tarixi + yangi xabar.
    const turns = trimToUserStart([...history, { role: "user" as const, text }]);

    // 3) AI'dan javob.
    try {
      const result = await model.reply({ system: buildSystemPrompt(role, lang), turns, ...(image ? { image } : {}) });
      usage.record(userId, day, result.inputTokens, result.outputTokens);
      if (!result.text) return { kind: "error", text: pick("error", lang) };

      // Tarixga faqat muvaffaqiyatli juftlik yoziladi. Rasmning o'zi saqlanmaydi — faqat belgi.
      conversations.add(userId, "user", image ? `[Rasm]${text ? ` ${text}` : ""}` : text);
      conversations.add(userId, "assistant", result.text);
      logger.info({ userId, role, inputTokens: result.inputTokens, outputTokens: result.outputTokens }, "AI reply");
      return { kind: "reply", text: result.text };
    } catch (err) {
      const kind = err instanceof LlmError ? err.kind : "other";
      logger.error({ userId, kind, err }, "AI request failed");
      const key = kind === "rate_limit" || kind === "overloaded" ? "busy" : "error";
      return { kind: "error", text: pick(key, lang) };
    }
  }
}

function lastUserLanguage(history: ChatTurn[]): Language | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i]!;
    if (turn.role !== "user") continue;
    const lang = detectLanguage(turn.text.replace(/^\[Rasm\]\s*/, ""));
    if (lang) return lang;
  }
  return null;
}

// Claude API'da suhbat "user" xabari bilan boshlanishi kerak.
function trimToUserStart<T extends { role: string }>(turns: T[]): T[] {
  const first = turns.findIndex((t) => t.role === "user");
  return first <= 0 ? turns : turns.slice(first);
}
