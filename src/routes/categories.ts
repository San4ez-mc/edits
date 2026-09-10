import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../auth';

export const categoriesRouter = Router();

// Заархівовані правки на сторінці категорій не показуємо (ні в лічильниках, ні в
// списку правок категорії) — архів вважається закритим питанням, не активною роботою.
const EXCLUDE_ARCHIVED = { not: 'archived' } as const;

categoriesRouter.get('/api/categories', requireAuth, async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({ orderBy: { createdAt: 'asc' } });
  const withCounts = await Promise.all(
    categories.map(async (c) => {
      const byStatus = await prisma.edit.groupBy({ by: ['status'], where: { categoryId: c.id, status: EXCLUDE_ARCHIVED }, _count: true });
      const counts: Record<string, number> = { new: 0, in_progress: 0, fixed: 0, no_effect: 0 };
      let total = 0;
      for (const row of byStatus) {
        counts[row.status] = row._count;
        total += row._count;
      }
      return { ...c, counts, total };
    })
  );
  const uncategorizedTotal = await prisma.edit.count({ where: { categoryId: null, status: EXCLUDE_ARCHIVED } });
  res.json({ ok: true, categories: withCounts, uncategorizedTotal });
});

categoriesRouter.post('/api/categories', requireAuth, async (req: Request, res: Response) => {
  const name = String(req.body?.name || '').trim();
  if (!name) return void res.status(400).json({ ok: false, error: 'name is required' });
  const category = await prisma.category.create({
    data: { name, description: req.body?.description || null, createdBy: 'manual' },
  });
  res.json({ ok: true, category });
});

categoriesRouter.patch('/api/categories/:id', requireAuth, async (req: Request, res: Response) => {
  const data: Record<string, unknown> = {};
  if ('name' in req.body) data.name = String(req.body.name).trim();
  if ('description' in req.body) data.description = req.body.description;
  try {
    const category = await prisma.category.update({ where: { id: req.params.id }, data });
    res.json({ ok: true, category });
  } catch {
    res.status(404).json({ ok: false, error: 'Not found' });
  }
});

categoriesRouter.delete('/api/categories/:id', requireAuth, async (req: Request, res: Response) => {
  const count = await prisma.edit.count({ where: { categoryId: req.params.id } });
  if (count > 0) {
    return void res.status(409).json({ ok: false, error: `Категорія має ${count} прив'язаних правок — спершу перенеси їх` });
  }
  try {
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ ok: false, error: 'Not found' });
  }
});
