import type { DatabaseSync } from "node:sqlite";

export type ChatTurn = { role: "user" | "assistant"; text: string };

// Suhbat tarixi. MUHIM: har bir so'rov user_id bilan filtrlanadi —
// bir foydalanuvchining xabarlari boshqasiga hech qachon aralashmaydi.
export class ConversationRepo {
  constructor(private readonly db: DatabaseSync) {}

  add(userId: number, role: ChatTurn["role"], text: string): void {
    this.db.prepare("INSERT INTO messages (user_id, role, text) VALUES (?, ?, ?)").run(userId, role, text);
  }

  // Oxirgi `limit` ta xabar, eskidan yangiga tartibda.
  recent(userId: number, limit: number): ChatTurn[] {
    const rows = this.db
      .prepare("SELECT role, text FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT ?")
      .all(userId, limit) as ChatTurn[];
    return rows.reverse().map((r) => ({ role: r.role, text: r.text }));
  }

  clear(userId: number): number {
    return Number(this.db.prepare("DELETE FROM messages WHERE user_id = ?").run(userId).changes);
  }
}
