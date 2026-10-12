import type { UserStatus } from "../users/userRepo.js";

export type Role = "OWNER" | "FRIEND" | "GUEST" | "BLOCKED";

type RoleInput = {
  userId: number;
  ownerId: number;
  accessMode: "open" | "allowlist";
  status: UserStatus | undefined;
};

// Rol FAQAT Telegram ID va bazadagi holatdan aniqlanadi.
// Username, ism yoki xabar matni bu yerda umuman ishlatilmaydi.
export function resolveRole({ userId, ownerId, accessMode, status }: RoleInput): Role {
  if (userId === ownerId) return "OWNER"; // owner hech qachon bloklanmaydi
  if (status === "blocked") return "BLOCKED";
  if (status === "allowed") return "FRIEND";
  return accessMode === "open" ? "GUEST" : "BLOCKED";
}

export function canChat(role: Role): boolean {
  return role !== "BLOCKED";
}
