// Дата-only рядки з фільтрів ("2026-09-11") мають розширюватись на весь день,
// інакше `to` парситься як 00:00:00 UTC і діапазон "сьогодні–сьогодні" виходить
// нульової ширини (знайдено на проді: "Всього: 0 правок" при реальних 3 за день).
export function startOfDayUTC(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function endOfDayUTC(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}
