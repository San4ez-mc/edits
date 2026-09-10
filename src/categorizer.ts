// AI-категоризація правок. Без окремого воркер-процесу: та сама логіка (categorizeOne)
// викликається і з фонового setInterval, і точково з agent-tools action `categorize_edit`.
import Anthropic from '@anthropic-ai/sdk';
import { prisma } from './db';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const INTERVAL_MS = Number(process.env.CATEGORIZE_INTERVAL_MS || 5 * 60 * 1000);
const BATCH_SIZE = Number(process.env.CATEGORIZE_BATCH_SIZE || 20);
const MAX_ATTEMPTS = 5;

const client = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

type CategorizeResult =
  | { kind: 'existing'; categoryId: string }
  | { kind: 'new'; name: string; description?: string }
  | { kind: 'skip' };

async function askModel(editText: string, categories: { id: string; name: string; description: string | null }[]): Promise<CategorizeResult> {
  if (!client) return { kind: 'skip' };

  const categoryList = categories.length
    ? categories.map((c) => `- id=${c.id} :: ${c.name}${c.description ? ` — ${c.description}` : ''}`).join('\n')
    : '(категорій ще немає)';

  const prompt = `Ти категоризуєш скарги/правки користувачів внутрішньої платформи аналізу правок FINEKO.
Існуючі категорії:
${categoryList}

Текст правки:
"""${editText}"""

Завдання: або обери НАЙБІЛЬШ ПІДХОДЯЩУ існуючу категорію за id, або, якщо жодна не підходить,
запропонуй нову категорію (коротка назва українською + опис одним реченням).
Категорії мають бути узагальнені (напр. "Помилки оплати", "UX плутанина", "Баги авторизації"),
не дублюй схожі за змістом категорії новою.

Відповідай ЛИШЕ JSON без пояснень, в одному з форматів:
{"existingCategoryId": "<id>"}
{"newCategory": {"name": "...", "description": "..."}}`;

  const msg = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = msg.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return { kind: 'skip' };

  const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { kind: 'skip' };
  const parsed = JSON.parse(jsonMatch[0]) as { existingCategoryId?: string; newCategory?: { name: string; description?: string } };

  if (parsed.existingCategoryId && categories.some((c) => c.id === parsed.existingCategoryId)) {
    return { kind: 'existing', categoryId: parsed.existingCategoryId };
  }
  if (parsed.newCategory?.name) {
    return { kind: 'new', name: parsed.newCategory.name, description: parsed.newCategory.description };
  }
  return { kind: 'skip' };
}

export async function categorizeOne(editId: string): Promise<{ ok: boolean; categoryId?: string; error?: string }> {
  const edit = await prisma.edit.findUnique({ where: { id: editId } });
  if (!edit) return { ok: false, error: 'not_found' };

  try {
    const categories = await prisma.category.findMany({ select: { id: true, name: true, description: true } });
    const result = await askModel(edit.text, categories);

    let categoryId: string | undefined;
    if (result.kind === 'existing') {
      categoryId = result.categoryId;
    } else if (result.kind === 'new') {
      const created = await prisma.category.create({ data: { name: result.name, description: result.description, createdBy: 'ai' } });
      categoryId = created.id;
    } else {
      await prisma.edit.update({ where: { id: editId }, data: { categorizeAttempts: { increment: 1 } } });
      return { ok: false, error: 'no_result' };
    }

    await prisma.edit.update({
      where: { id: editId },
      data: { categoryId, categorizedBy: 'ai', categorizedAt: new Date() },
    });
    return { ok: true, categoryId };
  } catch (err) {
    console.error('[categorizer] failed for edit', editId, err);
    await prisma.edit.update({ where: { id: editId }, data: { categorizeAttempts: { increment: 1 } } }).catch(() => {});
    return { ok: false, error: 'exception' };
  }
}

let running = false;

export async function runCategorizeBatch(): Promise<number> {
  if (running || !client) return 0;
  running = true;
  try {
    const pending = await prisma.edit.findMany({
      where: { categoryId: null, categorizeAttempts: { lt: MAX_ATTEMPTS } },
      orderBy: { createdAt: 'asc' },
      take: BATCH_SIZE,
      select: { id: true },
    });
    for (const { id } of pending) {
      await categorizeOne(id);
    }
    return pending.length;
  } finally {
    running = false;
  }
}

export function startCategorizerLoop() {
  if (!client) {
    console.warn('[categorizer] ANTHROPIC_API_KEY не задано — фонова AI-категоризація вимкнена (ручна категоризація через UI/agent-tools усе одно працює)');
    return;
  }
  setInterval(() => {
    runCategorizeBatch().catch((err) => console.error('[categorizer] batch error', err));
  }, INTERVAL_MS);
  // перший прогін одразу після старту, не чекаючи повного інтервалу
  setTimeout(() => runCategorizeBatch().catch((err) => console.error('[categorizer] initial batch error', err)), 10_000);
}
