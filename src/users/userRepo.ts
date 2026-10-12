import type { DatabaseSync } from "node:sqlite";

export type UserStatus = "none" | "allowed" | "blocked";

export type UserRecord = {
  telegramId: number;
  firstName: string | null;
  status: UserStatus;
};

// Users jadvali bilan ishlaydigan yagona joy. Boshqa modullar SQL yozmaydi.
export class UserRepo {
  constructor(private readonly db: DatabaseSync) {}

  find(telegramId: number): UserRecord | undefined {
    const row = this.db
      .prepare("SELECT telegram_id, first_name, status FROM users WHERE telegram_id = ?")
      .get(telegramId) as { telegram_id: number; first_name: string | null; status: UserStatus } | undefined;
    if (!row) return undefined;
    return { telegramId: row.telegram_id, firstName: row.first_name, status: row.status };
  }

  // Foydalanuvchi bazada bo'lmasa qo'shadi. true = yangi foydalanuvchi.
  ensure(telegramId: number, firstName: string | null): boolean {
    const result = this.db
      .prepare("INSERT OR IGNORE INTO users (telegram_id, first_name) VALUES (?, ?)")
      .run(telegramId, firstName);
    return result.changes > 0;
  }

  setStatus(telegramId: number, status: UserStatus): void {
    this.db
      .prepare(
        `INSERT INTO users (telegram_id, status) VALUES (?, ?)
         ON CONFLICT(telegram_id) DO UPDATE SET status = excluded.status`,
      )
      .run(telegramId, status);
  }
}
