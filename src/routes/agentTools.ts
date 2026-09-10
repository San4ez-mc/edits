// AI-категоризація + програмний доступ для ботів/воронок — той самий паттерн, що
// Контент платформа/src/app/api/agent-tools/route.ts: один ендпоінт, ?action=...&token=...,
// switch-dispatcher повертає JSON. Ці ж handler-функції повторно використовує /api/mcp.
import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireToken } from '../apiToken';
import { categorizeOne } from '../categorizer';

const INGEST_TOKEN = process.env.INGEST_TOKEN || '';

export const agentToolsRouter = Router();

async function listEdits(params: Record<string, unknown>) {
  const where: Record<string, unknown> = {};
  if (params.status) where.status = params.status;
  if (params.categoryId) where.categoryId = params.categoryId === 'null' ? null : params.categoryId;
  if (params.source) where.source = params.source;
  const limit = Math.min(200, Number(params.limit) || 50);
  const items = await prisma.edit.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit, include: { category: true } });
  return { ok: true, items };
}

async function getEdit(params: Record<string, unknown>) {
  const edit = await prisma.edit.findUnique({ where: { id: String(params.id || '') }, include: { images: true, category: true } });
  if (!edit) return { ok: false, error: 'Not found' };
  return { ok: true, edit };
}

async function createEdit(params: Record<string, unknown>) {
  const text = String(params.text || '').trim();
  const source = String(params.source || '').trim();
  if (!text || !source) return { ok: false, error: 'text and source are required' };
  const edit = await prisma.edit.create({
    data: {
      text,
      source,
      sourceRef: params.sourceRef ? String(params.sourceRef) : null,
      reporterName: params.reporterName ? String(params.reporterName) : null,
    },
  });
  return { ok: true, edit };
}

async function updateEdit(params: Record<string, unknown>) {
  const id = String(params.id || '');
  if (!id) return { ok: false, error: 'id is required' };
  const data: Record<string, unknown> = {};
  for (const field of ['status', 'categoryId', 'fixDescription', 'ownerComment'] as const) {
    if (params[field] !== undefined) data[field] = params[field];
  }
  if (params.fixedAt) data.fixedAt = new Date(String(params.fixedAt));
  try {
    const edit = await prisma.edit.update({ where: { id }, data });
    return { ok: true, edit };
  } catch {
    return { ok: false, error: 'Not found' };
  }
}

async function categorizeEdit(params: Record<string, unknown>) {
  const id = String(params.id || '');
  if (!id) return { ok: false, error: 'id is required' };

  if (params.categoryId) {
    const edit = await prisma.edit.update({
      where: { id },
      data: { categoryId: String(params.categoryId), categorizedBy: 'manual', categorizedAt: new Date() },
    }).catch(() => null);
    if (!edit) return { ok: false, error: 'Not found' };
    return { ok: true, edit };
  }
  if (params.newCategoryName) {
    const category = await prisma.category.create({
      data: { name: String(params.newCategoryName), description: params.newCategoryDescription ? String(params.newCategoryDescription) : null, createdBy: 'manual' },
    });
    const edit = await prisma.edit.update({
      where: { id },
      data: { categoryId: category.id, categorizedBy: 'manual', categorizedAt: new Date() },
    }).catch(() => null);
    if (!edit) return { ok: false, error: 'Not found' };
    return { ok: true, edit, category };
  }
  // без параметрів — миттєвий AI-виклик для цієї конкретної правки
  const result = await categorizeOne(id);
  return result;
}

async function listCategories() {
  const categories = await prisma.category.findMany({ orderBy: { createdAt: 'asc' } });
  return { ok: true, categories };
}

async function createCategory(params: Record<string, unknown>) {
  const name = String(params.name || '').trim();
  if (!name) return { ok: false, error: 'name is required' };
  const category = await prisma.category.create({ data: { name, description: params.description ? String(params.description) : null, createdBy: 'ai' } });
  return { ok: true, category };
}

async function renameCategory(params: Record<string, unknown>) {
  const id = String(params.id || '');
  if (!id) return { ok: false, error: 'id is required' };
  const data: Record<string, unknown> = {};
  if (params.name) data.name = String(params.name);
  if (params.description !== undefined) data.description = params.description;
  try {
    const category = await prisma.category.update({ where: { id }, data });
    return { ok: true, category };
  } catch {
    return { ok: false, error: 'Not found' };
  }
}

async function getStats(params: Record<string, unknown>) {
  const where = params.categoryId ? { categoryId: String(params.categoryId) } : {};
  const total = await prisma.edit.count({ where });
  const byStatusRaw = await prisma.edit.groupBy({ by: ['status'], where, _count: true });
  const byStatus: Record<string, number> = {};
  for (const row of byStatusRaw) byStatus[row.status] = row._count;
  return { ok: true, total, byStatus };
}

const ACTIONS: Record<string, (params: Record<string, unknown>) => Promise<unknown>> = {
  list_edits: listEdits,
  get_edit: getEdit,
  create_edit: createEdit,
  update_edit: updateEdit,
  categorize_edit: categorizeEdit,
  list_categories: listCategories,
  create_category: createCategory,
  rename_category: renameCategory,
  get_stats: getStats,
};

async function handle(req: Request, res: Response) {
  const params: Record<string, unknown> = { ...req.query, ...(req.body || {}) };
  const action = String(params.action || '');
  const fn = ACTIONS[action];
  if (!fn) return void res.status(400).json({ ok: false, error: `Unknown action: ${action}`, availableActions: Object.keys(ACTIONS) });
  try {
    res.json(await fn(params));
  } catch (err) {
    console.error('[agent-tools]', action, err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
}

agentToolsRouter.get('/api/agent-tools', requireToken(INGEST_TOKEN), handle);
agentToolsRouter.post('/api/agent-tools', requireToken(INGEST_TOKEN), handle);

export { ACTIONS as agentToolActions };
