import { describe, expect, it } from "vitest";
import { openDatabase } from "../src/db/db.js";
import { ConversationRepo } from "../src/chat/conversationRepo.js";
import { UsageRepo } from "../src/chat/usageRepo.js";
import { ChatService } from "../src/chat/chatService.js";
import { LlmError } from "../src/ai/llm.js";
import { createLogger } from "../src/lib/logger.js";
import { FakeModel, testConfig } from "./helpers.js";

const A = 1;
const B = 2;

function setup(limits: Partial<ReturnType<typeof testConfig>["limits"]> = {}) {
  const db = openDatabase(":memory:");
  const model = new FakeModel();
  const conversations = new ConversationRepo(db);
  const usage = new UsageRepo(db);
  let now = new Date("2026-10-12T10:00:00Z");
  const service = new ChatService({
    model,
    conversations,
    usage,
    limits: { ...testConfig().limits, ...limits },
    logger: createLogger("silent"),
    now: () => now,
  });
  return { service, model, conversations, usage, setNow: (d: string) => (now = new Date(d)) };
}

describe("ChatService", () => {
  it("javob beradi va tarixni saqlaydi", async () => {
    const { service, model } = setup();
    expect(await service.handle(A, "GUEST", "salom")).toEqual({ kind: "reply", text: "echo: salom" });
    await service.handle(A, "GUEST", "qalesan");
    expect(model.calls[1]!.turns).toEqual([
      { role: "user", text: "salom" },
      { role: "assistant", text: "echo: salom" },
      { role: "user", text: "qalesan" },
    ]);
  });

  it("foydalanuvchilar konteksti aralashmaydi", async () => {
    const { service, model } = setup();
    await service.handle(A, "GUEST", "mening sirim: 42");
    await service.handle(B, "GUEST", "A nima dedi?");
    const bTexts = model.calls[1]!.turns.map((t) => t.text).join(" ");
    expect(bTexts).not.toContain("42");
    expect(model.calls[1]!.turns).toHaveLength(1);
  });

  it("tarix HISTORY_LIMIT bilan cheklanadi va doim 'user' bilan boshlanadi", async () => {
    const { service, model } = setup({ historyLimit: 4 });
    for (let i = 0; i < 6; i++) await service.handle(A, "GUEST", `xabar ${i}`);
    const last = model.calls.at(-1)!.turns;
    expect(last.length).toBeLessThanOrEqual(4);
    expect(last[0]!.role).toBe("user");
    expect(last.at(-1)).toEqual({ role: "user", text: "xabar 5" });
  });

  it("kunlik xabar limiti AI'ga murojaatdan OLDIN ishlaydi; ertasi kuni tiklanadi", async () => {
    const { service, model, setNow } = setup({ dailyMessagesPerUser: 2 });
    await service.handle(A, "GUEST", "1");
    await service.handle(A, "GUEST", "2");
    const third = await service.handle(A, "GUEST", "3");
    expect(third.kind).toBe("user_limit");
    expect(model.calls).toHaveLength(2);

    setNow("2026-10-13T10:00:00Z");
    expect((await service.handle(A, "GUEST", "4")).kind).toBe("reply");
  });

  it("owner'ga shaxsiy xabar limiti qo'llanmaydi", async () => {
    const { service } = setup({ dailyMessagesPerUser: 1 });
    await service.handle(A, "OWNER", "1");
    expect((await service.handle(A, "OWNER", "2")).kind).toBe("reply");
  });

  it("umumiy kunlik token byudjeti tugasa hech kim AI'ni ishlata olmaydi (owner ham)", async () => {
    const { service, model } = setup({ dailyTokenBudget: 1000 });
    await service.handle(A, "GUEST", "1"); // har chaqiruv 120 token
    for (let i = 0; i < 8; i++) await service.handle(B, "GUEST", `${i}`);
    const before = model.calls.length;
    expect((await service.handle(A, "OWNER", "yana")).kind).toBe("budget");
    expect(model.calls).toHaveLength(before);
  });

  it("AI xatosida foydalanuvchiga xavfsiz xabar, tarixga hech narsa yozilmaydi", async () => {
    const { service, model, conversations } = setup();
    model.willReturn(new LlmError("overloaded", "API error 529"));
    const out = await service.handle(A, "GUEST", "salom");
    expect(out.kind).toBe("error");
    expect(out.text).not.toContain("529");
    expect(conversations.recent(A, 10)).toEqual([]);
  });

  it("xato xabari foydalanuvchi tilida", async () => {
    const { service, model } = setup();
    model.willReturn(new LlmError("other", "x"), new LlmError("other", "x"));
    expect((await service.handle(A, "GUEST", "Привет, как дела?")).text).toContain("попробуйте");
    expect((await service.handle(B, "GUEST", "Hi, how are you?")).text).toContain("try again");
  });

  it("bo'sh AI javobi foydalanuvchiga yuborilmaydi", async () => {
    const { service, model } = setup();
    model.willReturn("");
    expect((await service.handle(A, "GUEST", "salom")).kind).toBe("error");
  });

  it("bir foydalanuvchining parallel xabarlari navbat bilan ishlanadi", async () => {
    const { service, model } = setup();
    await Promise.all([service.handle(A, "GUEST", "bir"), service.handle(A, "GUEST", "ikki")]);
    expect(model.calls[1]!.turns.map((t) => t.text)).toEqual(["bir", "echo: bir", "ikki"]);
  });

  it("izohsiz rasmda til oldingi xabarlardan olinadi (xato xabari ham shu tilda)", async () => {
    const { service, model } = setup();
    await service.handle(A, "GUEST", "Привет, как дела?");
    model.willReturn(new LlmError("other", "x"));
    const out = await service.handle(A, "GUEST", "", { mimeType: "image/jpeg", base64: "AAAA" });
    expect(out.text).toContain("попробуйте");
    expect(model.calls[1]!.system).toContain("Russian");
  });

  it("system prompt'ga til ishorasi qo'shiladi", async () => {
    const { service, model } = setup();
    await service.handle(A, "GUEST", "Қаердасан?");
    expect(model.calls[0]!.system).toContain("Uzbek, Cyrillic script");
  });
});
