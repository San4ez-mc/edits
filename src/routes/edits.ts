import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireAuth, currentUser } from '../auth';
import { requireTokenOrSession } from '../apiToken';
import { upload, saveEditImages } from '../upload';

const INGEST_TOKEN = process.env.INGEST_TOKEN || '';

export const editsRouter = Router();

// ── Ingest: POST /api/edits ───────────────────────────────────────
// Обслуговує і зовнішні боти/воронки (Bearer INGEST_TOKEN), і форму «+ Додати правку»
// в самому UI (SSO-сесія) — обидва шляхи ведуть в один код.
// multipart/form-data (з images[]) або application/json (без зображень).
editsRouter.post('/api/edits', requireTokenOrSession(INGEST_TOKEN, (req) => !!currentUser(req)), upload.array('images', 10), async (req: Request, res: Response) => {
  const body = req.body || {};
  const text = String(body.text || '').trim();
  const source = String(body.source || '').trim();
  if (!text || !source) {
    return void res.status(400).json({ ok: false, error: 'text and source are required' });
  }

  const edit = await prisma.edit.create({
    data: {
      text,
      source,
      sourceRef: body.sourceRef ? String(body.sourceRef) : null,
      reporterName: body.reporterName ? String(body.reporterName) : null,
      categoryId: body.categoryId ? String(body.categoryId) : null,
      categorizedBy: body.categoryId ? 'manual' : null,
      categorizedAt: body.categoryId ? new Date() : null,
    },
  });

  const files = (req.files as Express.Multer.File[] | undefined) || [];
  if (files.length) {
    const saved = await saveEditImages(edit.id, files);
    await prisma.editImage.createMany({ data: saved.map((s) => ({ ...s, editId: edit.id })) });
  }

  const full = await prisma.edit.findUnique({ where: { id: edit.id }, include: { images: true, category: true } });
  res.json({ ok: true, edit: full });
});

// ── CRUD для UI (SSO-сесія) ───────────────────────────────────────
editsRouter.get('/api/edits/sources', requireAuth, async (_req: Request, res: Response) => {
  const rows = await prisma.edit.findMany({ distinct: ['source'], select: { source: true }, orderBy: { source: 'asc' } });
  res.json({ ok: true, sources: rows.map((r) => r.source) });
});

editsRouter.get('/api/edits', requireAuth, async (req: Request, res: Response) => {
  const { status, categoryId, source, from, to, q, includeArchived } = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status;
  } else if (includeArchived !== 'true') {
    // За замовчуванням архівовані правки не показуємо (ані в списку без фільтра
    // статусу, ані в категоріях/аналітиці) — тільки коли явно обрано статус
    // «Архів» або ввімкнено перемикач «показувати архівовані».
    where.status = { not: 'archived' };
  }
  if (categoryId) where.categoryId = categoryId === 'null' ? null : categoryId;
  if (source) where.source = source;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }
  if (q) where.text = { contains: q, mode: 'insensitive' };

  const [items, total] = await Promise.all([
    prisma.edit.findMany({
      where,
      include: { images: true, category: true },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.edit.count({ where }),
  ]);

  res.json({ ok: true, items, total, page, pageSize });
});

editsRouter.get('/api/edits/:id', requireAuth, async (req: Request, res: Response) => {
  const edit = await prisma.edit.findUnique({ where: { id: req.params.id }, include: { images: true, category: true } });
  if (!edit) return void res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, edit });
});

const EDITABLE_FIELDS = ['text', 'source', 'status', 'categoryId', 'fixDescription', 'ownerComment', 'fixedAt'] as const;

editsRouter.patch('/api/edits/:id', requireAuth, async (req: Request, res: Response) => {
  const body = req.body || {};
  const data: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) data[field] = field === 'fixedAt' && body[field] ? new Date(body[field]) : body[field];
  }
  if ('text' in data) data.text = String(data.text).trim();
  if ('source' in data) data.source = String(data.source).trim();
  if ('categoryId' in data) {
    data.categorizedBy = 'manual';
    data.categorizedAt = data.categoryId ? new Date() : null;
  }
  try {
    const edit = await prisma.edit.update({ where: { id: req.params.id }, data, include: { images: true, category: true } });
    res.json({ ok: true, edit });
  } catch {
    res.status(404).json({ ok: false, error: 'Not found' });
  }
});

editsRouter.post('/api/edits/:id/images', requireAuth, upload.array('images', 10), async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[] | undefined) || [];
  if (!files.length) return void res.status(400).json({ ok: false, error: 'No images provided' });
  const edit = await prisma.edit.findUnique({ where: { id: req.params.id } });
  if (!edit) return void res.status(404).json({ ok: false, error: 'Not found' });
  const saved = await saveEditImages(edit.id, files);
  await prisma.editImage.createMany({ data: saved.map((s) => ({ ...s, editId: edit.id })) });
  const images = await prisma.editImage.findMany({ where: { editId: edit.id } });
  res.json({ ok: true, images });
});

editsRouter.delete('/api/edits/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await prisma.edit.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ ok: false, error: 'Not found' });
  }
});
