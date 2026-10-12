import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, scrubSecrets } from "../src/lib/logger.js";

const TOKEN = "123456789:AAFakeTokenForTestsOnly_abcdefghijklmn";

function captureLogs() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { logger: createLogger("info", stream), output: () => lines.join("") };
}

describe("logger redaction", () => {
  it("botToken maydonini yashiradi", () => {
    const { logger, output } = captureLogs();
    logger.info({ botToken: TOKEN }, "config");
    expect(output()).not.toContain(TOKEN);
    expect(output()).toContain("[REDACTED]");
  });

  it("matn ichidagi tokenni yashiradi", () => {
    const { logger, output } = captureLogs();
    logger.info(`https://api.telegram.org/bot${TOKEN}/getMe`);
    expect(output()).not.toContain(TOKEN);
  });

  it("xato xabari ichidagi tokenni yashiradi", () => {
    const { logger, output } = captureLogs();
    logger.error({ err: new Error(`fetch failed for bot${TOKEN}`) }, "xato");
    expect(output()).not.toContain(TOKEN);
  });

  it("Anthropic API kalitini yashiradi (maydon va matn ichida)", () => {
    const { logger, output } = captureLogs();
    const key = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz";
    logger.info({ config: { llm: { apiKey: key } } }, `key is ${key}`);
    expect(output()).not.toContain(key);
  });

  it("Google API kalitini yashiradi", () => {
    expect(scrubSecrets("key=AIzaFakeKeyForTestsOnly_1234567890abc&x=1")).not.toContain("AIzaFake");
    expect(scrubSecrets("key=AQ.AbFakeNewFormatKey_1234567890.abcdef&x=1")).not.toContain("AbFakeNew");
  });

  it("scrubSecrets oddiy matnga tegmaydi", () => {
    expect(scrubSecrets("salom 12:30 da")).toBe("salom 12:30 da");
  });
});
