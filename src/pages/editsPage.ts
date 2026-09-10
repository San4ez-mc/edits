import type { SessionUser } from '../auth';
import { renderLayout, STATUS_LABELS } from './layout';

export function editsPage(user: SessionUser): string {
  const body = `
<div class="card">
  <div class="filters">
    <select id="f-status"><option value="">Усі статуси</option>${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <select id="f-source"><option value="">Усі джерела</option></select>
    <input id="f-q" placeholder="пошук у тексті правки">
    <input id="f-from" type="date">
    <input id="f-to" type="date">
    <button class="ghost" id="btn-filter">Фільтрувати</button>
    <button class="primary" id="btn-add" style="margin-left:auto">+ Додати правку</button>
  </div>
  <table>
    <thead><tr><th>Дата</th><th>Правка</th><th>Зображення</th><th>Джерело</th><th>Категорія</th><th>Статус</th><th>Дії</th></tr></thead>
    <tbody id="rows"><tr><td colspan="7" class="muted">Завантаження…</td></tr></tbody>
  </table>
  <div id="pager" style="margin-top:10px;display:flex;gap:8px;align-items:center"></div>
</div>

<div class="modal-bg" id="modal" style="display:none">
  <div class="modal">
    <h3 style="margin-top:0">Нова правка</h3>
    <div class="field"><label>Текст правки *</label><textarea id="m-text" rows="4"></textarea></div>
    <div class="field"><label>Джерело *</label>
      <select id="m-source">
        <option value="manual">Вручну (я)</option>
        <option value="goverla">goverla</option>
        <option value="covercar">covercar</option>
        <option value="content2">content2</option>
        <option value="flows">flows</option>
        <option value="other">інше</option>
      </select>
    </div>
    <div class="field"><label>Зображення (скріншоти)</label><input id="m-images" type="file" accept="image/*" multiple></div>
    <div id="m-error" style="color:#f85149;font-size:12px;margin-bottom:8px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="ghost" id="m-cancel">Скасувати</button>
      <button class="primary" id="m-save">Зберегти</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="editModal" style="display:none">
  <div class="modal">
    <h3 style="margin-top:0">Редагувати правку</h3>
    <div class="field"><label>Текст правки</label><textarea id="e-text" rows="4"></textarea></div>
    <div class="field"><label>Джерело</label><input id="e-source"></div>
    <div class="field"><label>Статус</label>
      <select id="e-status">${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Категорія</label><select id="e-category"><option value="">Без категорії</option></select></div>
    <div class="field"><label>Що зроблено для виправлення</label><textarea id="e-fix" rows="2"></textarea></div>
    <div class="field"><label>Коментар власника — чи дало ефект</label><textarea id="e-comment" rows="2"></textarea></div>
    <div class="field" style="max-width:200px"><label>Дата виправлення</label><input type="date" id="e-fixedAt"></div>
    <div id="e-error" style="color:#f85149;font-size:12px;margin-bottom:8px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <button class="ghost" id="e-cancel">Скасувати</button>
      <button class="primary" id="e-save">Зберегти</button>
    </div>
  </div>
</div>

<div class="modal-bg" id="imgModal" style="display:none"><img id="imgModalSrc" style="max-width:92vw;max-height:92vh;border-radius:8px"></div>
`;

  const script = `
const STATUS_LABELS = ${JSON.stringify(STATUS_LABELS)};
let page = 1;
let editsById = {};
let categories = [];
let editingId = null;
function esc(s){return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtDate(d){ return d ? new Date(d).toISOString().slice(0,10) : ''; }

async function loadCategories(){
  const res = await fetch('/api/categories');
  const data = await res.json();
  if(data.ok) categories = data.categories;
  const sel = document.getElementById('e-category');
  sel.innerHTML = '<option value="">Без категорії</option>' + categories.map(c => '<option value="'+c.id+'">'+esc(c.name)+'</option>').join('');
}

async function loadEdits(){
  const params = new URLSearchParams();
  const status = document.getElementById('f-status').value; if(status) params.set('status', status);
  const source = document.getElementById('f-source').value; if(source) params.set('source', source);
  const q = document.getElementById('f-q').value; if(q) params.set('q', q);
  const from = document.getElementById('f-from').value; if(from) params.set('from', from);
  const to = document.getElementById('f-to').value; if(to) params.set('to', to);
  params.set('page', page); params.set('pageSize', 25);
  const res = await fetch('/api/edits?'+params.toString());
  const data = await res.json();
  const rows = document.getElementById('rows');
  if(!data.ok || !data.items.length){ rows.innerHTML = '<tr><td colspan="7" class="muted">Нічого не знайдено</td></tr>'; return; }
  editsById = {};
  rows.innerHTML = data.items.map(e => {
    editsById[e.id] = e;
    const date = new Date(e.createdAt).toLocaleString('uk-UA', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const imgs = (e.images||[]).map(img => '<img class="thumb" src="'+img.filePath+'" onclick="openImg(\\''+img.filePath+'\\')">').join(' ');
    const cat = e.category ? esc(e.category.name) : '<span class="muted">без категорії</span>';
    return '<tr><td>'+date+'</td><td style="max-width:360px">'+esc(e.text)+'</td><td>'+(imgs||'<span class="muted">—</span>')+'</td><td>'+esc(e.source)+'</td><td>'+cat+'</td><td><span class="badge '+e.status+'">'+(STATUS_LABELS[e.status]||e.status)+'</span></td>'
      + '<td style="white-space:nowrap"><button class="ghost" data-edit="'+e.id+'">Редагувати</button> <button class="ghost" data-del="'+e.id+'" style="color:#f85149">Видалити</button></td></tr>';
  }).join('');
  rows.querySelectorAll('[data-edit]').forEach(btn => { btn.onclick = () => openEditModal(btn.dataset.edit); });
  rows.querySelectorAll('[data-del]').forEach(btn => { btn.onclick = () => deleteEdit(btn.dataset.del); });
  const pager = document.getElementById('pager');
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  pager.innerHTML = '<button class="ghost" id="prevPage" '+(page<=1?'disabled':'')+'>← Назад</button><span class="muted">стор. '+page+' з '+totalPages+' ('+data.total+' правок)</span><button class="ghost" id="nextPage" '+(page>=totalPages?'disabled':'')+'>Далі →</button>';
  const prevBtn = document.getElementById('prevPage'); if(prevBtn) prevBtn.onclick = ()=>{page--; loadEdits();};
  const nextBtn = document.getElementById('nextPage'); if(nextBtn) nextBtn.onclick = ()=>{page++; loadEdits();};
}

async function openEditModal(id){
  editingId = id;
  let e = editsById[id];
  if(categories.length === 0) await loadCategories();
  document.getElementById('e-text').value = e.text || '';
  document.getElementById('e-source').value = e.source || '';
  document.getElementById('e-status').value = e.status || 'new';
  document.getElementById('e-category').value = e.categoryId || '';
  document.getElementById('e-fix').value = e.fixDescription || '';
  document.getElementById('e-comment').value = e.ownerComment || '';
  document.getElementById('e-fixedAt').value = fmtDate(e.fixedAt);
  document.getElementById('e-error').textContent = '';
  document.getElementById('editModal').style.display = 'flex';
}

async function deleteEdit(id){
  const e = editsById[id];
  if(!confirm('Видалити правку «'+(e ? e.text.slice(0,60) : id)+'»? Дію не можна скасувати.')) return;
  const res = await fetch('/api/edits/'+id, { method: 'DELETE' });
  const data = await res.json();
  if(!data.ok){ alert(data.error || 'Помилка видалення'); return; }
  loadEdits();
}

document.getElementById('e-cancel').onclick = () => { document.getElementById('editModal').style.display = 'none'; };
document.getElementById('editModal').addEventListener('click', (ev) => { if(ev.target.id === 'editModal') document.getElementById('editModal').style.display = 'none'; });

document.getElementById('e-save').onclick = async () => {
  const errEl = document.getElementById('e-error');
  const text = document.getElementById('e-text').value.trim();
  const source = document.getElementById('e-source').value.trim();
  if(!text || !source){ errEl.textContent = 'Текст і джерело обовʼязкові'; return; }
  const body = {
    text, source,
    status: document.getElementById('e-status').value,
    categoryId: document.getElementById('e-category').value || null,
    fixDescription: document.getElementById('e-fix').value,
    ownerComment: document.getElementById('e-comment').value,
  };
  const fixedAtVal = document.getElementById('e-fixedAt').value;
  if(fixedAtVal) body.fixedAt = fixedAtVal;
  const res = await fetch('/api/edits/'+editingId, { method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const data = await res.json();
  if(!data.ok){ errEl.textContent = data.error || 'Помилка збереження'; return; }
  document.getElementById('editModal').style.display = 'none';
  loadEdits();
};

window.openImg = function(src){
  document.getElementById('imgModalSrc').src = src;
  document.getElementById('imgModal').style.display = 'flex';
};
document.getElementById('imgModal').onclick = () => { document.getElementById('imgModal').style.display = 'none'; };

document.getElementById('btn-filter').onclick = () => { page = 1; loadEdits(); };
document.getElementById('btn-add').onclick = () => { document.getElementById('modal').style.display = 'flex'; document.getElementById('m-error').textContent=''; };
document.getElementById('m-cancel').onclick = () => { document.getElementById('modal').style.display = 'none'; };
document.getElementById('modal').addEventListener('click', (e) => { if(e.target.id === 'modal') document.getElementById('modal').style.display = 'none'; });

document.getElementById('m-save').onclick = async () => {
  const text = document.getElementById('m-text').value.trim();
  const source = document.getElementById('m-source').value;
  const errEl = document.getElementById('m-error');
  if(!text){ errEl.textContent = 'Текст правки обовʼязковий'; return; }
  const fd = new FormData();
  fd.append('text', text); fd.append('source', source);
  const files = document.getElementById('m-images').files;
  for(const f of files) fd.append('images', f);
  const res = await fetch('/api/edits', { method: 'POST', body: fd });
  const data = await res.json();
  if(!data.ok){ errEl.textContent = data.error || 'Помилка збереження'; return; }
  document.getElementById('modal').style.display = 'none';
  document.getElementById('m-text').value = ''; document.getElementById('m-images').value = '';
  page = 1; loadEdits();
};

loadCategories();
loadEdits();
`;

  return renderLayout({ title: 'Список правок', activeHref: '/edits', user, bodyHtml: body, extraScript: script });
}
