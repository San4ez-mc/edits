import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../auth';
import { startOfDayUTC, endOfDayUTC, localDateKey } from '../dateRange';

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
    const day = localDateKey(e.createdAt);
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
  const byStatus: Record<string, number> = { new: 0, in_progress: 0, needs_admin: 0, fixed: 0, no_effect: 0 };
  for (const row of byStatusRaw) byStatus[row.status] = row._count;
  const resolvedPct = total > 0 ? Math.round(((byStatus.fixed || 0) / total) * 100) : 0;

  // Попередній період тієї самої довжини, що й вибраний фільтр (from..to) — а не
  // завжди "останні 7 днів": якщо обрано місяць, порівнюємо з попереднім місяцем.
  const periodMs = to.getTime() - from.getTime();
  const prevTo = new Date(from.getTime() - 1);
  const prevFrom = new Date(from.getTime() - periodMs - 1);
  const lastPeriod = await prisma.edit.count({ where: { createdAt: { gte: prevFrom, lte: prevTo }, status: EXCLUDE_ARCHIVED } });
  const thisPeriod = total; // total уже рахує рівно [from, to]
  const deltaPct = lastPeriod > 0 ? Math.round(((thisPeriod - lastPeriod) / lastPeriod) * 100) : thisPeriod > 0 ? 100 : 0;

  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const byCategory = await Promise.all(
    categories.map(async (c) => {
      const catTotal = await prisma.edit.count({ where: { categoryId: c.id, createdAt: { gte: from, lte: to }, status: EXCLUDE_ARCHIVED } });
      const catFixed = await prisma.edit.count({ where: { categoryId: c.id, status: 'fixed', createdAt: { gte: from, lte: to } } });
      return { id: c.id, name: c.name, total: catTotal, resolvedPct: catTotal > 0 ? Math.round((catFixed / catTotal) * 100) : 0 };
    })
  );
  const uncatTotal = await prisma.edit.count({ where: { categoryId: null, createdAt: { gte: from, lte: to }, status: EXCLUDE_ARCHIVED } });
  const uncatFixed = await prisma.edit.count({ where: { categoryId: null, status: 'fixed', createdAt: { gte: from, lte: to } } });
  if (uncatTotal > 0) {
    byCategory.push({ id: 'null', name: 'Без категорії', total: uncatTotal, resolvedPct: Math.round((uncatFixed / uncatTotal) * 100) });
  }
  byCategory.sort((a, b) => b.total - a.total);

  res.json({
    ok: true,
    total,
    resolvedPct,
    byStatus,
    trend: { thisPeriod, lastPeriod, deltaPct },
    byCategory,
  });
});
