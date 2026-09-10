# Правки (edits.fineko.space)

Внутрішній продукт екосистеми FINEKO — платформа аналізу правок/скарг користувачів.
Не для клієнтів: показує, чи проблеми в продуктах (goverla, covercar, content2, flows...)
вирішуються системно, чи повторюються.

Свідомо простий сервіс — Express + Prisma, без білду (`tsx`), без React/Next, HTML-сторінки
як шаблони на сервері з vanilla JS — за зразком `SSO` і `Векторна база` в цій екосистемі.

## 3 сторінки
- **`/edits`** — список правок: дата, текст, зображення, джерело, статус, категорія.
  Фільтри + форма ручного додавання.
- **`/categories`** — категорії (створює переважно AI, можна й вручну). По кожній
  окремій правці: статус, що зроблено для виправлення, коментар власника (чи дало
  ефект), дата виправлення.
- **`/analytics`** — динаміка скарг по днях/категоріях, % вирішено, тренд тиждень-до-
  тижня, таблиця категорій за обсягом.

## Локальний запуск
```
cp .env.example .env   # заповнити SSO_*, INGEST_TOKEN, ANTHROPIC_API_KEY
createdb -U postgres -h localhost fineko_edits
npm install
npm run db:push
npm run dev             # http://localhost:4800
```

Перед першим логіном — зареєструвати OAuth-клієнта в локальному SSO (`http://localhost:4600`):
```
curl -X POST http://localhost:4600/admin/clients \
  -H "x-admin-key: <ADMIN_API_KEY з SSO/.env>" \
  -H "Content-Type: application/json" \
  -d '{"name":"edits","redirectUris":["http://localhost:4800/auth/sso/callback"]}'
```
Отриманий `clientId`/`clientSecret` — у `.env` як `EDITS_SSO_CLIENT_ID`/`EDITS_SSO_CLIENT_SECRET`.

## API для інших продуктів/ботів
```
POST /api/edits                     # ingest — Bearer INGEST_TOKEN, multipart (text*, source*, images[])
GET|POST /api/agent-tools?action=&token=   # AI-категоризація + програмний доступ
POST /api/mcp                       # JSON-RPC (tools/list, tools/call) — ті самі дії, Bearer MCP_SECRET
```
Повний список дій agent-tools/mcp — див. `src/routes/agentTools.ts`.

## Деплой
`git pull → npm install → npm run db:push → pm2 restart edits` на VPS
`/var/www/edits.fineko.space`, pm2-процес `edits` (`tsx src/index.ts`, :4800, без білду),
nginx домен `edits.fineko.space`. `.env` — на сервері, не в git; звірити prod
`EDITS_SSO_CLIENT_ID/SECRET` (зареєструвати клієнта в прод-SSO з prod redirect-URI) і
`ANTHROPIC_API_KEY`.
