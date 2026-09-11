// Дата-only рядки з фільтрів ("2026-09-11") приходять з браузера користувача (Київ) і
// мають означати "доба за київським часом", а не UTC — інакше межа доби зсунута на
// 2-3 години (UTC+2/+3 залежно від DST) і "сьогодні" губить/додає записи біля півночі.
// Обчислюємо зсув явно через Intl для конкретної дати (враховує перехід на літній час),
// а не покладаємось на таймзону процесу (на VPS це UTC, локально — що завгодно).
const TIMEZONE = 'Europe/Kyiv';

function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) if (p.type !== 'literal') parts[p.type] = p.value;
  const asUTC = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return asUTC - date.getTime();
}

function localMidnightUTC(dateStr: string, timeZone: string): Date {
  const guess = new Date(`${dateStr}T00:00:00.000Z`);
  const offset = tzOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

export function startOfDayUTC(dateStr: string): Date {
  return localMidnightUTC(dateStr, TIMEZONE);
}

export function endOfDayUTC(dateStr: string): Date {
  // Кінець доби = початок наступної доби мінус 1мс — надійніше за "23:59:59.999",
  // яке довелось би саме так само зсувати під таймзону.
  const next = new Date(`${dateStr}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextDateStr = next.toISOString().slice(0, 10);
  return new Date(localMidnightUTC(nextDateStr, TIMEZONE).getTime() - 1);
}
