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
  <h3 style="margin-top:0">Розподіл статусів по днях</h3>
  <canvas id="barChart" height="90"></canvas>
</div>

<div class="card">
  <h3 style="margin-top:0">Категорії за обсягом</h3>
  <table>
    <thead><tr><th>Категорія</th><th>Правок у періоді</th><th>% виправлено</th></tr></thead>
    <tbody id="catRows"><tr><td colspan="3" class="muted">Завантаження…</td></tr></tbody>
  </table>
</div>
`;

  const extraHead = `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>`;

  const script = `
Chart.defaults.color = '#8b949e';
Chart.defaults.borderColor = '#21262d';
const COLORS = ['#58a6ff','#7ee787','#f0883e','#d29922','#f85149','#a371f7','#8b949e'];
const STATUS_COLORS = { new:'#58a6ff', in_progress:'#d29922', fixed:'#7ee787', no_effect:'#f85149', archived:'#8b949e' };
const STATUS_LABELS = { new:'Новий', in_progress:'У роботі', fixed:'Виправлено', no_effect:'Без ефекту', archived:'Архів' };
let lineChart, barChart;

function esc(s){return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
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
    '<div class="stat-tile"><div class="v '+trendClass+'">'+trendSign+data.trend.deltaPct+'%</div><div class="l">Скарг цей тиждень vs минулий ('+data.trend.thisWeek+' vs '+data.trend.lastWeek+')</div></div>',
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
  const datasets = topKeys.map((key, i) => ({
    label: labelByKey[key],
    data: days.map(d => { const row = data.rows.find(r=>r.day===d && r.key===key); return row ? row.count : 0; }),
    borderColor: COLORS[i % COLORS.length],
    backgroundColor: COLORS[i % COLORS.length],
    tension: 0.25,
  }));
  if(lineChart) lineChart.destroy();
  lineChart = new Chart(document.getElementById('lineChart'), {
    type: 'line',
    data: { labels: days, datasets },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { color: '#21262d' } }, y: { grid: { color: '#21262d' }, beginAtZero: true } } },
  });
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
    data: { labels: days, datasets },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true, grid: { color: '#21262d' } }, y: { stacked: true, grid: { color: '#21262d' }, beginAtZero: true } } },
  });
}

function loadAll(){ loadSummary(); loadLineChart(); loadBarChart(); }
document.getElementById('btn-apply').onclick = loadAll;
loadAll();
`;

  return renderLayout({ title: 'Аналітика', activeHref: '/analytics', user, bodyHtml: body, extraHead, extraScript: script });
}
