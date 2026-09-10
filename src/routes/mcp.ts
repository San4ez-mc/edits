// /api/mcp — hand-rolled JSON-RPC 2.0 HTTP-транспорт, той самий паттерн що
// система для воронок/platform/apps/api/src/routes/mcp-flows.js. Обгортає ті самі
// handler-функції, що й /api/agent-tools (agentToolActions) — без дублювання логіки.
import { Router, type Request, type Response } from 'express';
import { requireToken } from '../apiToken';
import { agentToolActions } from './agentTools';

const MCP_SECRET = process.env.MCP_SECRET || process.env.INGEST_TOKEN || '';

const TOOL_SCHEMAS: { name: string; description: string; inputSchema: Record<string, unknown> }[] = [
  { name: 'list_edits', description: 'Список правок з фільтрами (status, categoryId, source, limit)', inputSchema: { type: 'object', properties: { status: { type: 'string' }, categoryId: { type: 'string' }, source: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'get_edit', description: 'Отримати одну правку за id', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'create_edit', description: 'Створити нову правку (без зображень — для цього /api/edits)', inputSchema: { type: 'object', properties: { text: { type: 'string' }, source: { type: 'string' }, sourceRef: { type: 'string' }, reporterName: { type: 'string' } }, required: ['text', 'source'] } },
  { name: 'update_edit', description: 'Оновити статус/категорію/опис виправлення/коментар правки', inputSchema: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string' }, categoryId: { type: 'string' }, fixDescription: { type: 'string' }, ownerComment: { type: 'string' }, fixedAt: { type: 'string' } }, required: ['id'] } },
  { name: 'categorize_edit', description: 'Категоризувати одну правку — існуючою категорією, новою категорією, або AI (якщо параметрів категорії не передано)', inputSchema: { type: 'object', properties: { id: { type: 'string' }, categoryId: { type: 'string' }, newCategoryName: { type: 'string' }, newCategoryDescription: { type: 'string' } }, required: ['id'] } },
  { name: 'list_categories', description: 'Список усіх категорій', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_category', description: 'Створити категорію', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
  { name: 'rename_category', description: 'Перейменувати/змінити опис категорії', inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' }, description: { type: 'string' } }, required: ['id'] } },
  { name: 'get_stats', description: 'Швидкі лічильники правок за статусами (опційно по категорії)', inputSchema: { type: 'object', properties: { categoryId: { type: 'string' } } } },
];

export const mcpRouter = Router();

async function callTool(name: string, args: Record<string, unknown>) {
  const fn = agentToolActions[name];
  if (!fn) throw new Error(`Unknown tool: ${name}`);
  return fn(args || {});
}

async function handleRpc(msg: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }) {
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fineko-edits', version: '0.1.0' } } };
    }
    if (method === 'tools/list') {
      return { jsonrpc: '2.0', id, result: { tools: TOOL_SCHEMAS } };
    }
    if (method === 'tools/call') {
      const toolName = String(params?.name || '');
      const toolArgs = (params?.arguments as Record<string, unknown>) || {};
      const result = await callTool(toolName, toolArgs);
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } };
    }
    if (method === 'notifications/initialized') {
      return null; // notification, без відповіді
    }
    return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  } catch (err) {
    return { jsonrpc: '2.0', id, error: { code: -32000, message: err instanceof Error ? err.message : 'Internal error' } };
  }
}

mcpRouter.post('/api/mcp', requireToken(MCP_SECRET), async (req: Request, res: Response) => {
  const body = req.body;
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(handleRpc));
    return void res.json(results.filter(Boolean));
  }
  const result = await handleRpc(body);
  res.json(result || { jsonrpc: '2.0', id: null, result: null });
});

mcpRouter.get('/api/mcp', requireToken(MCP_SECRET), (_req: Request, res: Response) => {
  res.json({ ok: true, protocolVersion: '2024-11-05', tools: TOOL_SCHEMAS.map((t) => t.name) });
});
