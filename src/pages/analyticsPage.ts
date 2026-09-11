import type { SessionUser } from '../auth';
import { renderLayout } from './layout';

export function analyticsPage(user: SessionUser): string {
  const body = `
<div class="card">
  <div class="filters">
    <label class="muted" style="align-self:center">Період:</label>
    <input id="f-from" type="date">
    <input id="f-to" type="date">
    <button class="ghost" id="btn-apply">Застосувати</button>
  </div>
</div>

<div class="stat-row" id="stats"></div>

<div class="card">
  <h3 style="margin-top:0">Скарги по днях (топ-6 категорій)</h3>
  <canvas id="lineChart" height="90"></canvas>
</div>

<div class="card">
  <h3 style="margin-top:0">Правки, що повторюються</h3>
  <p class="muted" style="margin-top:-6px;font-size:12px">Категорії, у яких за період більше 1 правки — тобто та сама проблема виникала кілька разів.</p>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Категорія</th><th>Повторень</th><th>Динаміка по днях</th></tr></thead>
      <tbody id="repeatsRows"><tr><td colspan="3" class="muted">Завантаження…</td></tr></tbody>
    </table>
  </div>
</div>

<div class="card">
  <h3 style="margin-top:0">Розподіл статусів по днях</h3>
  <canvas id="barChart" height="90"></canvas>
</div>

<div class="card">
  <h3 style="margin-top:0">Категорії за обсягом</h3>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Категорія</th><th>Правок у періоді</th><th>% виправлено</th></tr></thead>
      <tbody id="catRows"><tr><td colspan="3" class="muted">Завантаження…</td></tr></tbody>
    </table>
  </div>
</div>
`;

  const extraHead = `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>`;

  const script = `
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#21262d';
const COLORS = ['#58a6ff','#7ee787','#f0883e','#d29922','#f85149','#a371f7','#8b949e'];
const STATUS_COLORS = { new:'#58a6ff', in_progress:'#d29922', needs_admin:'#8957e5', fixed:'#7ee787', no_effect:'#f85149', archived:'#8b949e' };
const STATUS_LABELS = { new:'Новий', in_progress:'У роботі', needs_admin:'Потрібне втручання адміна', fixed:'Виправлено', no_effect:'Без ефекту', archived:'Архів' };
let lineChart, barChart;

function esc(s){return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Формат дат у всій системі — ДД.ММ.РР (2-значний рік). day тут — чистий рядок
// "YYYY-MM-DD" з бекенду (вже в київській добі), тож просто переставляємо частини —
// без Date-парсингу, щоб не зачепити той самий UTC-зсув, що вже фіксили.
function fmtDayLabel(dayStr){ const p = dayStr.split('-'); return p[2]+'.'+p[1]+'.'+p[0].slice(-2); }
function rangeParams(){
  const p = new URLSearchParams();
  const from = document.getElementById('f-from').value, to = document.getElementById('f-to').value;
  if(from) p.set('from', from); if(to) p.set('to', to);
  return p;
}

async function loadSummary(){
  const res = await fetch('/api/analytics/summary?'+rangeParams().toString());
  const data = await res.json();
  if(!data.ok) return;
  const trendClass = data.trend.deltaPct > 0 ? 'trend-up' : (data.trend.deltaPct < 0 ? 'trend-down' : '');
  const trendSign = data.trend.deltaPct > 0 ? '+' : '';
  document.getElementById('stats').innerHTML = [
    '<div class="stat-tile"><div class="v">'+data.total+'</div><div class="l">Всього правок у періоді</div></div>',
    '<div class="stat-tile"><div class="v">'+data.resolvedPct+'%</div><div class="l">Виправлено</div></div>',
    '<div class="stat-tile"><div class="v '+trendClass+'">'+trendSign+data.trend.deltaPct+'%</div><div class="l">Скарг за період vs попередній такий самий ('+data.trend.thisPeriod+' vs '+data.trend.lastPeriod+')</div></div>',
  ].join('');
  document.getElementById('catRows').innerHTML = data.byCategory.length
    ? data.byCategory.map(c => '<tr><td>'+esc(c.name)+'</td><td>'+c.total+'</td><td>'+c.resolvedPct+'%</td></tr>').join('')
    : '<tr><td colspan="3" class="muted">Немає даних за період</td></tr>';
}

async function loadLineChart(){
  const params = rangeParams(); params.set('groupBy','category');
  const res = await fetch('/api/analytics/daily?'+params.toString());
  const data = await res.json();
  if(!data.ok) return;
  const days = [...new Set(data.rows.map(r=>r.day))].sort();
  const totalsByKey = {};
  for(const r of data.rows){ totalsByKey[r.key] = (totalsByKey[r.key]||0) + r.count; }
  const topKeys = Object.entries(totalsByKey).sort((a,b)=>b[1]-a[1]).slice(0,6).map(x=>x[0]);
  const labelByKey = {};
  for(const r of data.rows) labelByKey[r.key] = r.label;
  const totalByDay = {};
  for(const r of data.rows){ totalByDay[r.day] = (totalByDay[r.day]||0) + r.count; }
  const datasets = [
    {
      label: 'Всього скарг',
      data: days.map(d => totalByDay[d] || 0),
      borderColor: '#e6edf3',
      backgroundColor: '#e6edf3',
      borderWidth: 3,
      borderDash: [6, 3],
      tension: 0.25,
    },
    ...topKeys.map((key, i) => ({
      label: labelByKey[key],
      data: days.map(d => { const row = data.rows.find(r=>r.day===d && r.key===key); return row ? row.count : 0; }),
      borderColor: COLORS[i % COLORS.length],
      backgroundColor: COLORS[i % COLORS.length],
      tension: 0.25,
    })),
  ];
  if(lineChart) lineChart.destroy();
  lineChart = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: { labels: days.map(fmtDayLabel), datasets },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { color: '#21262d' } }, y: { grid: { color: '#21262d' }, beginAtZero: true } } },
  });
  renderRepeats(data, days, totalsByKey, labelByKey);
}

// «Повторюються» — категорії з >1 правкою за період (та сама проблема виникала кілька
// разів), з міні-спарклайном по днях, щоб одразу бачити динаміку без окремого графіка.
function renderRepeats(data, days, totalsByKey, labelByKey){
  const el = document.getElementById('repeatsRows');
  const repeats = Object.entries(totalsByKey).filter(([,total]) => total > 1).sort((a,b) => b[1]-a[1]);
  if(!repeats.length){ el.innerHTML = '<tr><td colspan="3" class="muted">Повторюваних правок за період немає</td></tr>'; return; }
  const maxCount = Math.max(...repeats.map(([,t]) => t));
  el.innerHTML = repeats.map(([key, total]) => {
    const bars = days.map(d => {
      const row = data.rows.find(r => r.day === d && r.key === key);
      const c = row ? row.count : 0;
      const h = c > 0 ? Math.max(4, Math.round(c / maxCount * 22)) : 2;
      return '<div class="spark-bar" style="height:'+h+'px" title="'+fmtDayLabel(d)+': '+c+'"></div>';
    }).join('');
    return '<tr><td>'+esc(labelByKey[key])+'</td><td>'+total+'</td><td><div class="spark">'+bars+'</div></td></tr>';
  }).join('');
}

async function loadBarChart(){
  const params = rangeParams(); params.set('groupBy','status');
  const res = await fetch('/api/analytics/daily?'+params.toString());
  const data = await res.json();
  if(!data.ok) return;
  const days = [...new Set(data.rows.map(r=>r.day))].sort();
  const statuses = Object.keys(STATUS_LABELS);
  const datasets = statuses.map(st => ({
    label: STATUS_LABELS[st],
    data: days.map(d => { const row = data.rows.find(r=>r.day===d && r.key===st); return row ? row.count : 0; }),
    backgroundColor: STATUS_COLORS[st],
  }));
  if(barChart) barChart.destroy();
  barChart = new Chart(document.getElementById('barChart'), {
    type: 'bar',
    data: { labels: days.map(fmtDayLabel), datasets },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, grid: { color: '#21262d' } }, y: { stacked: true, grid: { color: '#21262d' }, beginAtZero: true } } },
  });
}

function loadAll(){ loadSummary(); loadLineChart(); loadBarChart(); }
document.getElementById('btn-apply').onclick = loadAll;

// Локальна (не UTC!) дата браузера — той самий фікс, що на /edits: toISOString()
// зсуває на UTC-офсет і біля півночі за київським часом дав би "вчора".
function localDateStr(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
const toDefault = new Date();
const fromDefault = new Date(); fromDefault.setDate(fromDefault.getDate() - 6);
document.getElementById('f-to').value = localDateStr(toDefault);
document.getElementById('f-from').value = localDateStr(fromDefault);

loadAll();
`;

  return renderLayout({ title: 'Аналітика', activeHref: '/analytics', user, bodyHtml: body, extraHead, extraScript: script });
}
