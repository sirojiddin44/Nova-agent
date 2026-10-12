# ✨ Nova — Telegram AI agent

Nova ([@MyNovaAgent_bot](https://t.me/MyNovaAgent_bot)) — o'zbek, rus va ingliz tillarida gaplashadigan, rasmlarni tushunadigan Telegram AI yordamchi.

## Imkoniyatlar

- 💬 Tabiiy suhbat (Google Gemini yoki Anthropic Claude orqali)
- 🌐 Uch til: o'zbek (lotin va kirill), rus, ingliz — foydalanuvchi qaysi tilda yozsa, shu tilda javob beradi
- 📷 Rasmlarni tushunish (JPG, PNG, WEBP, 5 MB gacha)
- 🔒 Har bir foydalanuvchining suhbati alohida, `/forget` bilan o'chiriladi
- 👑 Owner (egasi) va oddiy foydalanuvchilar ajratilgan — rol faqat Telegram ID orqali aniqlanadi
- 💸 Xarajat himoyasi: har bir foydalanuvchiga kunlik limit + umumiy kunlik token byudjeti

## Texnologiyalar

Node.js · TypeScript · [grammY](https://grammy.dev) · SQLite (`node:sqlite`) · zod · pino · vitest

## Ishga tushirish (Windows, PowerShell)

```powershell
npm install
Copy-Item .env.example .env
notepad .env        # BOT_TOKEN, OWNER_TELEGRAM_ID va GEMINI_API_KEY ni to'ldiring
npm run dev
```

| Kalit | Qayerdan olinadi |
|---|---|
| `BOT_TOKEN` | Telegram → [@BotFather](https://t.me/BotFather) → `/newbot` |
| `OWNER_TELEGRAM_ID` | Telegram → [@userinfobot](https://t.me/userinfobot) |
| `GEMINI_API_KEY` | [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys) |

> ⚠️ `.env` faylini hech qachon GitHub'ga yuklamang va tokenlarni hech kimga yubormang.

## Buyruqlar

| Buyruq | Kim uchun | Vazifasi |
|---|---|---|
| `/start`, `/help` | hamma | Salomlashish va yordam |
| `/forget` | hamma | O'z suhbat tarixini o'chirish |
| `/whoami` | hamma | ID va rol |
| `/stats` | owner | Bugungi foydalanish statistikasi |
| `/allow <id>`, `/block <id>` | owner | Foydalanuvchiga ruxsat berish / bloklash |
| `/ping` | owner | Bot ishlayotganini tekshirish |

## Testlar

```powershell
npm test
npm run typecheck
```

## Deploy (Railway)

Loyihada `Dockerfile` va `railway.json` bor. Railway'da: GitHub repo'dan yangi loyiha → **Variables** ga `BOT_TOKEN`, `OWNER_TELEGRAM_ID`, `GEMINI_API_KEY` → **Volume** ni `/app/data` ga ulang (aks holda har deploy'da ma'lumotlar o'chadi).

Bitta bot tokeni bilan bot faqat **bitta joyda** ishlashi mumkin — Railway ishlayotganda lokal `npm run dev` ni ishga tushirmang.
