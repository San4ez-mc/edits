import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../auth';
import { startOfDayUTC, endOfDayUTC } from '../dateRange';

export const analyticsRouter = Router();

function parseRange(query: Record<string, string | undefined>) {
  const to = query.to ? endOfDayUTC(query.to) : new Date();
  const from = query.from ? startOfDayUTC(query.from) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

// Заархівовані правки в аналітику не потрапляють — вони закриті питання, не активна динаміка.
const EXCLUDE_ARCHIVED = { not: 'archived' } as const;

// Динаміка скарг/день, згруповано по категорії або статусу — для лінійного/stacked графіка.
// Агрегація в JS (не raw SQL) — простіше й безпечніше для невеликого внутрішнього продукту;
// обсяг правок тут не очікується настільки великим, щоб це було вузьким місцем.
analyticsRouter.get('/api/analytics/daily', requireAuth, async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | undefined>;
  const { from, to } = parseRange(query);
  const groupBy = query.groupBy === 'status' ? 'status' : 'category';
  const categoryId = query.categoryId;

  const where: Record<string, unknown> = { createdAt: { gte: from, lte: to }, status: EXCLUDE_ARCHIVED };
  if (groupBy === 'category' && categoryId) where.categoryId = categoryId === 'null' ? null : categoryId;

  const edits = await prisma.edit.findMany({
    where,
    select: { createdAt: true, status: true, categoryId: true, category: { select: { name: true } } },
  });

  const buckets = new Map<string, Map<string, { count: number; label: string }>>();
  for (const e of edits) {
    const day = e.createdAt.toISOString().slice(0, 10);
    const key = groupBy === 'status' ? e.status : e.categoryId || 'null';
    const label = groupBy === 'status' ? e.status : e.category?.name || 'Без категорії';
    if (!buckets.has(day)) buckets.set(day, new Map());
    const dayBucket = buckets.get(day)!;
    const entry = dayBucket.get(key) || { count: 0, label };
    entry.count += 1;
    dayBucket.set(key, entry);
  }

  const rows: { day: string; key: string; label: string; count: number }[] = [];
  for (const [day, dayBucket] of [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    for (const [key, { count, label }] of dayBucket) rows.push({ day, key, label, count });
  }

  res.json({ ok: true, groupBy, rows });
});

analyticsRouter.get('/api/analytics/summary', requireAuth, async (req: Request, res: Response) => {
  const query = req.query as Record<string, string | undefined>;
  const { from, to } = parseRange(query);

  const [total, byStatusRaw] = await Promise.all([
    prisma.edit.count({ where: { createdAt: { gte: from, lte: to }, status: EXCLUDE_ARCHIVED } }),
    prisma.edit.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to }, status: EXCLUDE_ARCHIVED }, _count: true }),
  ]);
  const byStatus: Record<string, number> = { new: 0, in_progress: 0, fixed: 0, no_effect: 0 };
  for (const row of byStatusRaw) byStatus[row.status] = row._count;
  const resolvedPct = total > 0 ? Math.round(((byStatus.fixed || 0) / total) * 100) : 0;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const [thisWeek, lastWeek] = await Promise.all([
    prisma.edit.count({ where: { createdAt: { gte: weekAgo, lte: now }, status: EXCLUDE_ARCHIVED } }),
    prisma.edit.count({ where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo }, status: EXCLUDE_ARCHIVED } }),
  ]);
  const deltaPct = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : thisWeek > 0 ? 100 : 0;

  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const byCategory = await Promise.all(
    categories.map(async (c) => {
      const catTotal = await prisma.edit.count({ where: { categoryId: c.id, createdAt: { gte: from, lte: to }, status: EXCLUDE_ARCHIVED } });
      const catFixed = await prisma.edit.count({ where: { categoryId: c.id, status: 'fixed', createdAt: { gte: from, lte: to } } });
      return { id: c.id, name: c.name, total: catTotal, resolvedPct: catTotal > 0 ? Math.round((catFixed / catTotal) * 100) : 0 };
    })
  );
  byCategory.sort((a, b) => b.total - a.total);

  res.json({
    ok: true,
    total,
    resolvedPct,
    byStatus,
    trend: { thisWeek, lastWeek, deltaPct },
    byCategory,
  });
});
