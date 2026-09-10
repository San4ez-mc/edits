// Зберігання зображень — локальний диск, як media-upload у content2
// (Контент платформа/src/app/api/media/route.ts): файл → uploads/<editId>/<ts>-<rand>.<ext>,
// шлях+мета в БД, роздається через express.static('/uploads').
import multer from 'multer';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

export const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

// memory storage: спершу створюємо Edit (щоб мати editId), потім пишемо файли на диск.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Дозволені тільки зображення'));
    cb(null, true);
  },
});

export type SavedImage = { filePath: string; fileName: string; mimeType: string; fileSize: number };

export async function saveEditImages(editId: string, files: Express.Multer.File[]): Promise<SavedImage[]> {
  if (!files.length) return [];
  const dir = path.join(UPLOADS_DIR, editId);
  await mkdir(dir, { recursive: true });
  const saved: SavedImage[] = [];
  for (const file of files) {
    const ext = path.extname(file.originalname) || guessExt(file.mimetype);
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await writeFile(path.join(dir, safeName), file.buffer);
    saved.push({
      filePath: `/uploads/${editId}/${safeName}`,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
    });
  }
  return saved;
}

function guessExt(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp',
    'image/gif': '.gif',
  };
  return map[mime] || '';
}
