import type { DatabaseSync } from "node:sqlite";

export type DailyUsage = { messageCount: number; inputTokens: number; outputTokens: number };

// Kun UTC bo'yicha hisoblanadi: "2026-10-12".
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export class UsageRepo {
  constructor(private readonly db: DatabaseSync) {}

  record(userId: number, day: string, inputTokens: number, outputTokens: number): void {
    this.db
      .prepare(
        `INSERT INTO usage (user_id, day, message_count, input_tokens, output_tokens) VALUES (?, ?, 1, ?, ?)
         ON CONFLICT(user_id, day) DO UPDATE SET
           message_count = message_count + 1,
           input_tokens  = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens`,
      )
      .run(userId, day, inputTokens, outputTokens);
  }

  forUser(userId: number, day: string): DailyUsage {
    const row = this.db
      .prepare("SELECT message_count, input_tokens, output_tokens FROM usage WHERE user_id = ? AND day = ?")
      .get(userId, day) as { message_count: number; input_tokens: number; output_tokens: number } | undefined;
    return {
      messageCount: row?.message_count ?? 0,
      inputTokens: row?.input_tokens ?? 0,
      outputTokens: row?.output_tokens ?? 0,
    };
  }

  // Bugun hamma foydalanuvchilar birgalikda nechta token ishlatgani.
  totalTokens(day: string): number {
    const row = this.db
      .prepare("SELECT COALESCE(SUM(input_tokens + output_tokens), 0) AS total FROM usage WHERE day = ?")
      .get(day) as { total: number };
    return Number(row.total);
  }

  activeUsers(day: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM usage WHERE day = ?").get(day) as { n: number };
    return Number(row.n);
  }
}
