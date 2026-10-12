import { run } from "@grammyjs/runner";
import { loadConfig, ConfigError } from "./config/env.js";
import { createLogger, scrubSecrets } from "./lib/logger.js";
import { openDatabase } from "./db/db.js";
import { UserRepo } from "./users/userRepo.js";
import { ConversationRepo } from "./chat/conversationRepo.js";
import { UsageRepo } from "./chat/usageRepo.js";
import { ChatService } from "./chat/chatService.js";
import { createChatModel } from "./ai/createModel.js";
import { createBot } from "./telegram/bot.js";

async function main() {
  let config;
  try {
    config = loadConfig(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logger = createLogger(config.logLevel);
  const db = openDatabase(config.databasePath);
  const usage = new UsageRepo(db);
  const chat = new ChatService({
    model: createChatModel(config.llm),
    conversations: new ConversationRepo(db),
    usage,
    limits: config.limits,
    logger,
  });
  const bot = createBot({ config, users: new UserRepo(db), chat, usage, logger });

  if (!config.llm.provider) logger.warn("No AI key (GEMINI_API_KEY / ANTHROPIC_API_KEY): AI is disabled, Nova will send placeholder replies");

  // Tokenni tekshiramiz, webhook'ni o'chiramiz (long polling bilan to'qnashmasin).
  await bot.init();
  await bot.api.deleteWebhook();

  // Long polling, lekin update'lar PARALLEL ishlanadi: bir odamga AI javob yozayotganda
  // boshqalar kutib turmaydi. Bitta odamning xabarlari esa ChatService'da navbat bilan.
  const runner = run(bot);
  logger.info(
    { username: bot.botInfo.username, accessMode: config.accessMode, ai: config.llm.provider ?? "off", model: config.llm.provider ? config.llm.model : undefined },
    "✨ Nova ishga tushdi",
  );

  // Ctrl+C bosilganda botni va bazani to'g'ri yopamiz.
  const shutdown = async () => {
    logger.info("Nova to'xtamoqda...");
    if (runner.isRunning()) await runner.stop();
    db.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err) => {
  // Logger hali yaratilmagan bo'lishi mumkin — shuning uchun tokenni tozalab console'ga.
  console.error("Nova ishga tushmadi:", scrubSecrets(err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
