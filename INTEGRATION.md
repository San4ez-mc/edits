# Інтеграція «Правки» з flows-воронками та MCP-клієнтами

Сервіс: https://edits.fineko.space (локально — http://localhost:4800).
Усі виклики нижче потребують токена — той самий `INGEST_TOKEN`/`MCP_SECRET` з `.env`
сервісу (**не** SSO-токен користувача).

## 1. Передача скарги з бота/воронки (ingest)

Коли бот у flows бачить скаргу користувача — одразу шле її сюди, без ручного копіювання:

```
POST https://edits.fineko.space/api/edits
Authorization: Bearer <INGEST_TOKEN>
Content-Type: multipart/form-data   (якщо є скріншот) або application/json

{
  "text": "Кнопка оплати не працює на мобільному",
  "source": "goverla",              // назва продукту-джерела
  "sourceRef": "chat_12345",        // chat_id/sessionId — опційно, для трасування
  "reporterName": "Іван П."         // опційно
}
```
Для скріншота — те саме через `multipart/form-data` з полем `images` (до 10 файлів).

У flows-воронці це звичайна **HTTP-нода** (як `webhook.js`/`js`-ноди в інших ботах), не
tool-нода агента — виклик іде напряму з коду ноди, без участі Claude.

## 2. Підключення як інструментів Claude-агента в flows

Той самий патерн, що вже використовує `Content Agent` у content2-воронці (`tools[]` на
ноді агента, `type: "http"`) — просто додай ці записи в `tools` потрібного агента:

```json
{
  "url": "https://edits.fineko.space/api/agent-tools?action=list_edits&token=<INGEST_TOKEN>",
  "name": "list_edits",
  "type": "http",
  "description": "Список правок з фільтрами",
  "inputSchema": {
    "type": "object",
    "properties": {
      "status": { "type": "string", "description": "new|in_progress|fixed|no_effect|archived" },
      "categoryId": { "type": "string" },
      "source": { "type": "string" },
      "limit": { "type": "number" }
    }
  }
},
{
  "url": "https://edits.fineko.space/api/agent-tools?action=create_edit&token=<INGEST_TOKEN>",
  "name": "create_edit",
  "type": "http",
  "description": "Створити нову правку (без зображень)",
  "inputSchema": {
    "type": "object",
    "required": ["text", "source"],
    "properties": {
      "text": { "type": "string" },
      "source": { "type": "string" },
      "sourceRef": { "type": "string" },
      "reporterName": { "type": "string" }
    }
  }
},
{
  "url": "https://edits.fineko.space/api/agent-tools?action=categorize_edit&token=<INGEST_TOKEN>",
  "name": "categorize_edit",
  "type": "http",
  "description": "Категоризувати правку — існуючою категорією (categoryId), новою (newCategoryName+newCategoryDescription), або AI (без параметрів категорії)",
  "inputSchema": {
    "type": "object",
    "required": ["id"],
    "properties": {
      "id": { "type": "string" },
      "categoryId": { "type": "string" },
      "newCategoryName": { "type": "string" },
      "newCategoryDescription": { "type": "string" }
    }
  }
},
{
  "url": "https://edits.fineko.space/api/agent-tools?action=update_edit&token=<INGEST_TOKEN>",
  "name": "update_edit",
  "type": "http",
  "description": "Оновити статус/категорію/опис виправлення/коментар правки",
  "inputSchema": {
    "type": "object",
    "required": ["id"],
    "properties": {
      "id": { "type": "string" },
      "status": { "type": "string" },
      "categoryId": { "type": "string" },
      "fixDescription": { "type": "string" },
      "ownerComment": { "type": "string" },
      "fixedAt": { "type": "string" }
    }
  }
},
{
  "url": "https://edits.fineko.space/api/agent-tools?action=list_categories&token=<INGEST_TOKEN>",
  "name": "list_categories",
  "type": "http",
  "description": "Список усіх категорій правок",
  "inputSchema": { "type": "object", "properties": {} }
},
{
  "url": "https://edits.fineko.space/api/agent-tools?action=get_stats&token=<INGEST_TOKEN>",
  "name": "get_stats",
  "type": "http",
  "description": "Швидкі лічильники правок за статусами (опційно по категорії)",
  "inputSchema": {
    "type": "object",
    "properties": { "categoryId": { "type": "string" } }
  }
}
```
`get_edit`, `create_category`, `rename_category` — той самий патерн, дії описані в
`src/routes/agentTools.ts`.

## 3. Підключення як справжнього MCP-сервера (Claude Code / Claude.ai)

`/api/mcp` — HTTP JSON-RPC 2.0 (`tools/list`, `tools/call`), той самий формат, що
`platform-mcp` у flows. У Claude Code:

```
claude mcp add edits --transport http https://edits.fineko.space/api/mcp \
  --header "Authorization: Bearer <MCP_SECRET>"
```

Або вручну в конфіг MCP-клієнта:
```json
{
  "mcpServers": {
    "edits": {
      "url": "https://edits.fineko.space/api/mcp",
      "headers": { "Authorization": "Bearer <MCP_SECRET>" }
    }
  }
}
```
Перевірити список інструментів вручну:
```
curl -X POST https://edits.fineko.space/api/mcp \
  -H "Authorization: Bearer <MCP_SECRET>" -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## 4. Де взяти токени

`INGEST_TOKEN`/`MCP_SECRET` — з `.env` сервісу на VPS (`/var/www/edits.fineko.space/.env`)
або локального `.env` для dev. Один і той самий токен працює і для ingest, і для
agent-tools, і (якщо `MCP_SECRET` не задано окремо) для `/api/mcp`.
