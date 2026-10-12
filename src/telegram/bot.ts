import { Bot, type Context } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import type { Logger } from "pino";
import type { Config, LlmProvider } from "../config/env.js";
import { PROVIDER_LABELS } from "../ai/createModel.js";
import { MAX_IMAGE_BYTES, isSupportedImageType, type SupportedImageType } from "../ai/llm.js";
import type { UserRepo } from "../users/userRepo.js";
import type { ChatService } from "../chat/chatService.js";
import { dayKey, type UsageRepo } from "../chat/usageRepo.js";
import { canChat, resolveRole, type Role } from "../auth/roles.js";

// Har bir update'ga biz qo'shadigan qo'shimcha maydon: foydalanuvchining roli.
export type NovaContext = Context & { role: Role };

type BotDeps = {
  config: Config;
  users: UserRepo;
  chat: ChatService;
  usage: UsageRepo;
  logger: Logger;
  botInfo?: UserFromGetMe; // testlarda Telegram'ga murojaat qilmaslik uchun
  downloadFile?: (filePath: string) => Promise<Uint8Array>; // testlarda soxta yuklab oluvchi
};

// Telegram serveridan faylni yuklab oladi. URL ichida token bor — uni hech qachon logga yozmaymiz.
function telegramDownloader(botToken: string) {
  return async (filePath: string): Promise<Uint8Array> => {
    const res = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
    if (!res.ok) throw new Error(`File download failed: HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
}

const TELEGRAM_LIMIT = 4000;

// Foydalanuvchiga xabarlari qayerga ketishini halol aytamiz.
function privacyNotice(provider: LlmProvider | null): string {
  if (provider === "gemini") {
    return "Xabarlaringiz javob tayyorlash uchun Google Gemini'ga yuboriladi va Google ulardan o'z xizmatlarini yaxshilashda foydalanishi mumkin. ";
  }
  if (provider === "claude") return "Xabarlaringiz javob tayyorlash uchun Anthropic Claude'ga yuboriladi. ";
  return "";
}

// Telegram bitta xabarda ~4096 belgigacha qabul qiladi — uzun javobni bo'laklaymiz.
export function splitMessage(text: string, limit = TELEGRAM_LIMIT): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf("\n", limit);
    if (cut < limit / 2) cut = rest.lastIndexOf(" ", limit);
    if (cut < limit / 2) cut = limit;
    parts.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

export function createBot({ config, users, chat, usage, logger, botInfo, downloadFile = telegramDownloader(config.botToken) }: BotDeps): Bot<NovaContext> {
  const bot = new Bot<NovaContext>(config.botToken, botInfo ? { botInfo } : {});
  const isOwner = (ctx: NovaContext) => ctx.role === "OWNER";

  const notifyOwner = async (text: string) => {
    try {
      await bot.api.sendMessage(config.ownerId, text);
    } catch (err) {
      logger.warn({ err }, "Owner'ga bildirishnoma yuborilmadi");
    }
  };

  // MVP: faqat shaxsiy chatlar. Guruh va kanallar e'tiborsiz qoldiriladi.
  const pm = bot.chatType("private");

  // 1) Identity + Authorization: har bir xabarda rolni aniqlaymiz.
  pm.use(async (ctx, next) => {
    const from = ctx.from;
    if (!from || from.is_bot) return;

    const isNew = from.id !== config.ownerId && users.ensure(from.id, from.first_name);
    const role = resolveRole({
      userId: from.id,
      ownerId: config.ownerId,
      accessMode: config.accessMode,
      status: users.find(from.id)?.status,
    });
    ctx.role = role;
    logger.debug({ userId: from.id, role }, "update");

    if (isNew) {
      const action = role === "BLOCKED" ? `Ruxsat berish: /allow ${from.id}` : `Bloklash: /block ${from.id}`;
      await notifyOwner(`Bro, Nova'ga yangi foydalanuvchi yozdi.\nIsm: ${from.first_name}\nID: ${from.id}\n${action}`);
    }

    if (!canChat(role)) {
      if (isNew) await ctx.reply("Kechirasiz, Nova hozircha faqat taklif qilinganlar uchun ishlaydi.");
      return; // keyingi handler'larga o'tkazmaymiz
    }
    await next();
  });

  pm.command("start", async (ctx) => {
    if (isOwner(ctx)) {
      await ctx.reply(
        "Salom bro! ✨ Nova ishga tushdi.\n" +
          "Buyruqlar: /stats, /whoami, /allow <id>, /block <id>, /forget, /ping",
      );
      return;
    }
    await ctx.reply(
      "Salom! Men Nova — AI yordamchiman ✨\n" +
        "O'zbek, rus yoki ingliz tilida yozavering, rasm ham yuborishingiz mumkin 📷\n\n" +
        "Bilib qo'ying: men odam emas, AI'man. " +
        privacyNotice(config.llm.provider) +
        "Parol, karta raqami kabi maxfiy narsalarni yozmang.\n" +
        "Tarixni o'chirish: /forget",
    );
  });

  pm.command("help", async (ctx) => {
    await ctx.reply("Menga istalgan savolingizni yozing yoki rasm yuboring 📷\n/forget — suhbat tarixini o'chirish\n/whoami — ID va rolingiz");
  });

  pm.command("whoami", async (ctx) => {
    await ctx.reply(`ID: ${ctx.from.id}\nRol: ${ctx.role}`);
  });

  pm.command("forget", async (ctx) => {
    const removed = chat.clearHistory(ctx.from.id);
    await ctx.reply(`🧹 Suhbat tarixingiz o'chirildi (${removed} ta xabar).`);
  });

  pm.command("ping", async (ctx) => {
    if (!isOwner(ctx)) return;
    await ctx.reply("pong 🏓");
  });

  pm.command("stats", async (ctx) => {
    if (!isOwner(ctx)) return;
    const day = dayKey(new Date());
    const total = usage.totalTokens(day);
    await ctx.reply(
      `📊 Bugun (${day}, UTC)\n` +
        `Faol foydalanuvchilar: ${usage.activeUsers(day)}\n` +
        `Tokenlar: ${total.toLocaleString("en-US")} / ${config.limits.dailyTokenBudget.toLocaleString("en-US")}\n` +
        (config.llm.provider
          ? `AI: ${PROVIDER_LABELS[config.llm.provider]} (${config.llm.model})`
          : "AI: o'chiq (GEMINI_API_KEY yoki ANTHROPIC_API_KEY yo'q)"),
    );
  });

  // /allow va /block — faqat owner uchun.
  for (const [command, status] of [["allow", "allowed"], ["block", "blocked"]] as const) {
    pm.command(command, async (ctx) => {
      if (!isOwner(ctx)) return;
      const targetId = Number(ctx.match.trim());
      if (!Number.isSafeInteger(targetId) || targetId <= 0) {
        await ctx.reply(`Foydalanish: /${command} <telegram_id>`);
        return;
      }
      if (targetId === config.ownerId) {
        await ctx.reply("O'zingni o'zgartira olmaysan, bro 😄");
        return;
      }
      users.setStatus(targetId, status);
      logger.info({ targetId, status }, "Foydalanuvchi holati o'zgardi");
      await ctx.reply(`✅ ${targetId} → ${status}`);
    });
  }

  // Oddiy matnli xabarlar → AI suhbat. Javob faqat shu chatga qaytadi.
  pm.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      await ctx.reply("Bunday buyruq yo'q 🤔 /help");
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    const outcome = await chat.handle(ctx.from.id, ctx.role, ctx.message.text);
    for (const part of splitMessage(outcome.text)) {
      await ctx.reply(part);
    }
  });

  // Rasm → Telegram'dan yuklab olamiz → AI'ga ko'rsatamiz.
  const answerImage = async (
    ctx: NovaContext & { from: { id: number } },
    file: { fileId: string; size: number | undefined; mimeType: SupportedImageType },
    caption: string,
  ) => {
    if ((file.size ?? 0) > MAX_IMAGE_BYTES) {
      await ctx.reply("Rasm juda katta 😅 5 MB dan kichikroq rasm yuboring.");
      return;
    }
    await ctx.replyWithChatAction("typing").catch(() => undefined);
    let bytes: Uint8Array;
    try {
      const info = await ctx.api.getFile(file.fileId);
      if (!info.file_path) throw new Error("Telegram returned no file_path");
      bytes = await downloadFile(info.file_path);
      if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("Image too large after download");
    } catch (err) {
      logger.warn({ err, userId: ctx.from.id }, "Image download failed");
      await ctx.reply("Rasmni ocha olmadim 😔 Yana bir bor yuborib ko'ring.");
      return;
    }
    const image = { mimeType: file.mimeType, base64: Buffer.from(bytes).toString("base64") };
    const outcome = await chat.handle(ctx.from.id, ctx.role, caption, image);
    for (const part of splitMessage(outcome.text)) {
      await ctx.reply(part);
    }
  };

  pm.on("message:photo", async (ctx) => {
    // Telegram bitta rasmni bir nechta o'lchamda beradi — oxirgisi eng kattasi.
    const largest = ctx.message.photo.at(-1)!;
    await answerImage(ctx, { fileId: largest.file_id, size: largest.file_size, mimeType: "image/jpeg" }, ctx.message.caption ?? "");
  });

  // "Fayl sifatida" yuborilgan rasm (siqilmagan). Boshqa fayllar pastdagi handler'ga o'tadi.
  pm.on("message:document", async (ctx, next) => {
    const doc = ctx.message.document;
    if (!isSupportedImageType(doc.mime_type)) return next();
    await answerImage(ctx, { fileId: doc.file_id, size: doc.file_size, mimeType: doc.mime_type }, ctx.message.caption ?? "");
  });

  pm.on("message", async (ctx) => {
    await ctx.reply("Hozircha matn va rasmlarni tushunaman 🙂 (JPG, PNG, WEBP)");
  });

  bot.catch((err) => {
    logger.error({ err: err.error, updateId: err.ctx.update.update_id }, "Update'ni qayta ishlashda xato");
  });

  return bot;
}
