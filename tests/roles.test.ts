import { describe, expect, it } from "vitest";
import { canChat, resolveRole } from "../src/auth/roles.js";

const OWNER = 1;

describe("resolveRole", () => {
  it("owner ID → OWNER, hatto bazada blocked bo'lsa ham", () => {
    expect(resolveRole({ userId: OWNER, ownerId: OWNER, accessMode: "allowlist", status: "blocked" })).toBe("OWNER");
  });

  it("open rejimda notanish user → GUEST (suhbatlasha oladi)", () => {
    const role = resolveRole({ userId: 2, ownerId: OWNER, accessMode: "open", status: "none" });
    expect(role).toBe("GUEST");
    expect(canChat(role)).toBe(true);
  });

  it("allowlist rejimda notanish user → BLOCKED", () => {
    const role = resolveRole({ userId: 2, ownerId: OWNER, accessMode: "allowlist", status: undefined });
    expect(role).toBe("BLOCKED");
    expect(canChat(role)).toBe(false);
  });

  it("allowed user → FRIEND, blocked user → BLOCKED (har ikkala rejimda)", () => {
    for (const accessMode of ["open", "allowlist"] as const) {
      expect(resolveRole({ userId: 2, ownerId: OWNER, accessMode, status: "allowed" })).toBe("FRIEND");
      expect(resolveRole({ userId: 2, ownerId: OWNER, accessMode, status: "blocked" })).toBe("BLOCKED");
    }
  });
});
