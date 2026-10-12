import pino, { type DestinationStream, type Logger } from "pino";

// Logga hech qachon tushmasligi kerak bo'lgan maydonlar.
const REDACT_PATHS = ["botToken", "token", "apiKey", "*.botToken", "*.token", "*.apiKey", "config.botToken", "config.llm.apiKey"];

// Telegram tokeni (123456789:ABC...), Anthropic (sk-ant-...) va Google (AIza... / AQ.Ab...)
// kalitlari matn ichida uchrasa ham yashiramiz (masalan, xato xabaridagi URL ichida).
const SECRET_PATTERNS = [
  /\d{6,}:[A-Za-z0-9_-]{30,}/g,
  /sk-ant-[A-Za-z0-9_-]{10,}/g,
  /AIza[A-Za-z0-9_-]{20,}/g,
  /\bAQ\.[A-Za-z0-9_.-]{20,}/g,
];

export function scrubSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((t, p) => t.replace(p, "[REDACTED]"), text);
}

export function createLogger(level: string, destination?: DestinationStream): Logger {
  return pino(
    {
      level,
      redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
      hooks: {
        // Har bir log yozuvi chiqishidan oldin matnli argumentlardan tokenni tozalaymiz.
        logMethod(args, method) {
          const cleaned = args.map((a) => (typeof a === "string" ? scrubSecrets(a) : a));
          method.apply(this, cleaned as Parameters<typeof method>);
        },
      },
      serializers: {
        err: (err: Error) => ({
          type: err.name,
          message: scrubSecrets(err.message),
          stack: err.stack ? scrubSecrets(err.stack) : undefined,
        }),
      },
    },
    destination,
  );
}
