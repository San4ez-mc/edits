import type { SessionUser } from '../auth';
import { renderLayout, STATUS_LABELS } from './layout';

export function categoriesPage(user: SessionUser): string {
  const body = `
<div class="card">
  <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap">
    <div class="field" style="flex:1;min-width:180px"><label>Нова категорія — назва</label><input id="nc-name"></div>
    <div class="field" style="flex:2;min-width:240px"><label>Опис (опційно)</label><input id="nc-desc"></div>
    <button class="primary" id="nc-add" style="margin-bottom:10px">+ Додати категорію</button>
  </div>
</div>

<div class="grid2">
  <div class="card" id="catList"><div class="muted">Завантаження…</div></div>
  <div class="card" id="editList"><div class="muted">Обери категорію ліворуч</div></div>
</div>
`;

  const script = `
const STATUS_LABELS = ${JSON.stringify(STATUS_LABELS)};
let activeCategoryId = '';
function esc(s){return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(d){ return d ? new Date(d).toISOString().slice(0,10) : ''; }
// Формат дат у всій системі — ДД.ММ.РР (2-значний рік), локальний час браузера.
function fmtDateTimeShort(d){ const dt=new Date(d); const p=n=>String(n).padStart(2,'0'); return p(dt.getDate())+'.'+p(dt.getMonth()+1)+'.'+String(dt.getFullYear()).slice(-2)+', '+p(dt.getHours())+':'+p(dt.getMinutes()); }

async function loadCategories(){
  const res = await fetch('/api/categories');
  const data = await res.json();
  const el = document.getElementById('catList');
  if(!data.ok) { el.innerHTML = '<div class="muted">Помилка завантаження</div>'; return; }
  let html = '<div class="cat-item'+(activeCategoryId==='__none'?' active':'')+'" data-id="__none"><div class="nm">Без категорії</div><div class="cnt">'+data.uncategorizedTotal+' правок</div></div>';
  html += data.categories.map(c => {
    const fixed = c.counts.fixed||0, total = c.total||0;
    const pct = total>0 ? Math.round(fixed/total*100) : 0;
    return '<div class="cat-item'+(activeCategoryId===c.id?' active':'')+'" data-id="'+c.id+'"><div class="nm">'+esc(c.name)+'</div><div class="cnt">'+total+' правок · '+pct+'% виправлено</div></div>';
  }).join('');
  el.innerHTML = html;
  el.querySelectorAll('.cat-item').forEach(node => {
    node.onclick = () => { activeCategoryId = node.dataset.id; loadCategories(); loadEdits(); };
  });
}

async function loadEdits(){
  const el = document.getElementById('editList');
  if(!activeCategoryId){ el.innerHTML = '<div class="muted">Обери категорію ліворуч</div>'; return; }
  const params = new URLSearchParams();
  params.set('categoryId', activeCategoryId === '__none' ? 'null' : activeCategoryId);
  params.set('pageSize', 100);
  const res = await fetch('/api/edits?'+params.toString());
  const data = await res.json();
  if(!data.ok || !data.items.length){ el.innerHTML = '<div class="muted">У цій категорії поки немає правок</div>'; return; }
  el.innerHTML = data.items.map(renderEditRow).join('');
  el.querySelectorAll('[data-save]').forEach(btn => { btn.onclick = () => saveEdit(btn.dataset.save); });
}

function renderEditRow(e){
  const statusOpts = Object.entries(STATUS_LABELS).map(([v,l]) => '<option value="'+v+'" '+(e.status===v?'selected':'')+'>'+l+'</option>').join('');
  return '<div class="card" style="background:#0d1117" id="row-'+e.id+'">'
    + '<div class="muted" style="font-size:11px;margin-bottom:4px">'+fmtDateTimeShort(e.createdAt)+' · '+esc(e.source)+'</div>'
    + '<div style="margin-bottom:10px">'+esc(e.text)+'</div>'
    + '<div class="field"><label>Статус</label><select id="st-'+e.id+'">'+statusOpts+'</select></div>'
    + '<div class="field"><label>Що зроблено для виправлення</label><textarea id="fx-'+e.id+'" rows="2">'+esc(e.fixDescription)+'</textarea></div>'
    + '<div class="field"><label>Коментар власника — чи дало ефект</label><textarea id="cm-'+e.id+'" rows="2">'+esc(e.ownerComment)+'</textarea></div>'
    + '<div class="field" style="max-width:200px"><label>Дата виправлення</label><input type="date" id="dt-'+e.id+'" value="'+fmtDate(e.fixedAt)+'"></div>'
    + '<button class="primary" data-save="'+e.id+'">Зберегти</button> <span class="muted" id="saved-'+e.id+'" style="margin-left:8px;font-size:12px"></span>'
    + '</div>';
}

async function saveEdit(id){
  const status = document.getElementById('st-'+id).value;
  const fixDescription = document.getElementById('fx-'+id).value;
  const ownerComment = document.getElementById('cm-'+id).value;
  const fixedAtVal = document.getElementById('dt-'+id).value;
  const body = { status, fixDescription, ownerComment };
  if(fixedAtVal) body.fixedAt = fixedAtVal;
  const res = await fetch('/api/edits/'+id, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  const saved = document.getElementById('saved-'+id);
  saved.textContent = data.ok ? 'Збережено ✓' : (data.error || 'Помилка');
  if(data.ok) setTimeout(()=>{ saved.textContent=''; }, 2000);
  loadCategories();
}

document.getElementById('nc-add').onclick = async () => {
  const name = document.getElementById('nc-name').value.trim();
  const description = document.getElementById('nc-desc').value.trim();
  if(!name) return;
  await fetch('/api/categories', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, description }) });
  document.getElementById('nc-name').value = ''; document.getElementById('nc-desc').value = '';
  loadCategories();
};

loadCategories();
`;

  return renderLayout({ title: 'Категорії', activeHref: '/categories', user, bodyHtml: body, extraScript: script });
}
