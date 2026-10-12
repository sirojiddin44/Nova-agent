# Nova — Telegram AI agent. Railway shu fayl orqali image yig'adi.
# Node 24 — LTS (uzoq qo'llab-quvvatlanadigan) versiya; node:sqlite unda bor.
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production

# Avval faqat paketlar ro'yxati — kod o'zgarsa ham bu qadam keshdan olinadi (tezroq build).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

# Baza shu papkada turadi. Railway'da bu yerga Volume ulanadi (/app/data),
# aks holda har deploy'da userlar va tarix o'chib ketadi.
RUN mkdir -p /app/data

# npm orqali emas, to'g'ridan-to'g'ri node: shunda SIGTERM (to'xtatish signali) botga yetib boradi.
# Sozlamalar Railway Variables'dan keladi, .env fayl bu yerda yo'q.
CMD ["node", "--import", "tsx", "src/index.ts"]
