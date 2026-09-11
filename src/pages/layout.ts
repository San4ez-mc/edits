// Спільний dark-theme шаблон — та сама GitHub-dark палітра, що адмінка SSO
// (SSO/src/index.ts, adminPage()): фон #0b0f1a, картки #0d1117/rgba(22,27,34,.85),
// межі #30363d, текст #e6edf3, приглушений #8b949e, акценти #58a6ff/#238636/#f0883e.
import type { SessionUser } from '../auth';

const TABS = [
  { href: '/edits', label: 'Список правок' },
  { href: '/categories', label: 'Категорії' },
  { href: '/analytics', label: 'Аналітика' },
];

const BASE_CSS = `
body{font-family:system-ui,-apple-system,sans-serif;margin:0;background:#0b0f1a;color:#e6edf3;min-height:100vh;overflow-x:hidden}
.wrap{max-width:1280px;margin:0 auto;padding:20px 16px 60px}
a{color:#58a6ff;text-decoration:none}
header.top{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px;flex-wrap:wrap}
h1{font-size:18px;margin:0}
nav{display:flex;gap:6px}
nav a{padding:7px 14px;border-radius:8px;font-size:13px;color:#c9d1d9;border:1px solid transparent}
nav a.active{background:rgba(88,166,255,.12);border-color:#1f6feb;color:#58a6ff}
nav a:hover{background:rgba(255,255,255,.05)}
.user{display:flex;align-items:center;gap:10px;font-size:12px;color:#8b949e}
.card{background:rgba(22,27,34,.85);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px;margin-bottom:14px}
select,input,textarea,button{background:#0d1117;border:1px solid #30363d;border-radius:8px;color:#e6edf3;padding:7px 10px;font-size:13px;font-family:inherit}
textarea{width:100%;box-sizing:border-box;resize:vertical}
button{cursor:pointer;font-weight:600}
button.primary{background:#238636;border-color:#2ea043;color:#fff}
button.primary:hover{background:#2ea043}
button.ghost{background:none;color:#8b949e}
button.ghost:hover{color:#e6edf3;border-color:#8b949e}
.table-wrap{overflow-x:auto;margin:0 -16px;padding:0 16px}
table{width:100%;border-collapse:collapse;font-size:13px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #21262d;vertical-align:top}
th{color:#8b949e;font-weight:600;font-size:11.5px;text-transform:uppercase;letter-spacing:.03em;white-space:nowrap}
.muted{color:#8b949e}
.badge{font-size:11px;border-radius:6px;padding:2px 8px;border:1px solid #30363d;display:inline-block;white-space:nowrap}
.badge.new{color:#58a6ff;border-color:#1f6feb}
.badge.in_progress{color:#d29922;border-color:#9e6a03}
.badge.fixed{color:#7ee787;border-color:#2ea043}
.badge.no_effect{color:#f85149;border-color:#f85149}
.badge.needs_admin{color:#d2a8ff;border-color:#8957e5}
.badge.archived{color:#8b949e}
.spark{display:flex;align-items:flex-end;gap:2px;height:24px}
.spark-bar{width:5px;background:#58a6ff;border-radius:1px;min-height:2px}
.thumb{width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid #30363d;cursor:zoom-in}
.filters{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
.filters select,.filters input{min-width:120px}
@media (max-width:640px){
  .wrap{padding:14px 12px 40px}
  header.top{gap:8px}
  h1{font-size:16px}
  .filters select,.filters input,.filters button{flex:1 1 100%;min-width:0}
  .filters label{flex:1 1 100%}
}
.grid2{display:grid;grid-template-columns:280px 1fr;gap:16px}
@media (max-width:860px){.grid2{grid-template-columns:1fr}}
.cat-item{padding:10px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent;margin-bottom:4px}
.cat-item:hover{background:rgba(255,255,255,.04)}
.cat-item.active{background:rgba(88,166,255,.1);border-color:#1f6feb}
.cat-item .nm{font-weight:600;font-size:13px}
.cat-item .cnt{font-size:11px;color:#8b949e}
.stat-row{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.stat-tile{background:#0d1117;border:1px solid #30363d;border-radius:10px;padding:14px 18px;min-width:140px}
.stat-tile .v{font-size:24px;font-weight:700}
.stat-tile .l{font-size:11.5px;color:#8b949e;margin-top:2px}
.trend-up{color:#f85149}
.trend-down{color:#7ee787}
.modal-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:50}
.modal{background:#0d1117;border:1px solid #30363d;border-radius:12px;padding:20px;max-width:560px;width:92%;max-height:88vh;overflow:auto}
.field{margin-bottom:10px}
.field label{display:block;font-size:11.5px;color:#8b949e;margin-bottom:4px}
.field input,.field select,.field textarea{width:100%;box-sizing:border-box}
`;

export function renderLayout(opts: { title: string; activeHref: string; user: SessionUser | null; bodyHtml: string; extraHead?: string; extraScript?: string }): string {
  const nav = TABS.map((t) => `<a href="${t.href}" class="${t.href === opts.activeHref ? 'active' : ''}">${t.label}</a>`).join('');
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${opts.title} — Правки FINEKO</title>
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${BASE_CSS}</style>
${opts.extraHead || ''}
</head><body><div class="wrap">
<header class="top">
  <h1>🛠 Правки FINEKO</h1>
  <nav>${nav}</nav>
  <div class="user">${opts.user ? `<span>${opts.user.email}</span><a href="/auth/logout">вийти</a>` : ''}</div>
</header>
${opts.bodyHtml}
</div>
${opts.extraScript ? `<script>${opts.extraScript}</script>` : ''}
</body></html>`;
}

export const STATUS_LABELS: Record<string, string> = {
  new: 'Новий',
  in_progress: 'У роботі',
  needs_admin: 'Потрібне втручання адміна',
  fixed: 'Виправлено',
  no_effect: 'Без ефекту',
  archived: 'Архів',
};
