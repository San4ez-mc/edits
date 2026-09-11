// Повний JSON-експорт бази — усі правки (з зображеннями, статусами, історією
// виправлень/коментарів) і всі категорії. Для бекапу/аналізу поза системою.
import { Router, type Request, type Response } from 'express';
import { prisma } from '../db';
import { requireAuth } from '../auth';

export const exportRouter = Router();

exportRouter.get('/api/export', requireAuth, async (_req: Request, res: Response) => {
  const [categories, edits] = await Promise.all([
    prisma.category.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.edit.findMany({
      orderBy: { createdAt: 'asc' },
      include: { images: true, category: { select: { name: true } } },
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    countCategories: categories.length,
    countEdits: edits.length,
    categories,
    edits: edits.map((e) => ({
      id: e.id,
      text: e.text,
      source: e.source,
      sourceRef: e.sourceRef,
      reporterName: e.reporterName,
      status: e.status,
      categoryId: e.categoryId,
      categoryName: e.category?.name ?? null,
      categorizedBy: e.categorizedBy,
      categorizedAt: e.categorizedAt,
      categorizeAttempts: e.categorizeAttempts,
      fixDescription: e.fixDescription,
      ownerComment: e.ownerComment,
      fixedAt: e.fixedAt,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      images: e.images.map((img) => ({ filePath: img.filePath, fileName: img.fileName, mimeType: img.mimeType, fileSize: img.fileSize, createdAt: img.createdAt })),
    })),
  };

  const today = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="edits-export-${today}.json"`);
  res.type('application/json').send(JSON.stringify(payload, null, 2));
});
