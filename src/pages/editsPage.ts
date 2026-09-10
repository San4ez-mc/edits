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
    <thead><tr><th>Дата</th><th>Правка</th><th>Зображення</th><th>Джерело</th><th>Категорія</th><th>Статус</th></tr></thead>
    <tbody id="rows"><tr><td colspan="6" class="muted">Завантаження…</td></tr></tbody>
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

<div class="modal-bg" id="imgModal" style="display:none"><img id="imgModalSrc" style="max-width:92vw;max-height:92vh;border-radius:8px"></div>
`;

  const script = `
const STATUS_LABELS = ${JSON.stringify(STATUS_LABELS)};
let page = 1;
function esc(s){return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

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
  if(!data.ok || !data.items.length){ rows.innerHTML = '<tr><td colspan="6" class="muted">Нічого не знайдено</td></tr>'; return; }
  rows.innerHTML = data.items.map(e => {
    const date = new Date(e.createdAt).toLocaleString('uk-UA', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
    const imgs = (e.images||[]).map(img => '<img class="thumb" src="'+img.filePath+'" onclick="openImg(\\''+img.filePath+'\\')">').join(' ');
    const cat = e.category ? esc(e.category.name) : '<span class="muted">без категорії</span>';
    return '<tr><td>'+date+'</td><td style="max-width:360px">'+esc(e.text)+'</td><td>'+(imgs||'<span class="muted">—</span>')+'</td><td>'+esc(e.source)+'</td><td>'+cat+'</td><td><span class="badge '+e.status+'">'+(STATUS_LABELS[e.status]||e.status)+'</span></td></tr>';
  }).join('');
  const pager = document.getElementById('pager');
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));
  pager.innerHTML = '<button class="ghost" id="prevPage" '+(page<=1?'disabled':'')+'>← Назад</button><span class="muted">стор. '+page+' з '+totalPages+' ('+data.total+' правок)</span><button class="ghost" id="nextPage" '+(page>=totalPages?'disabled':'')+'>Далі →</button>';
  const prevBtn = document.getElementById('prevPage'); if(prevBtn) prevBtn.onclick = ()=>{page--; loadEdits();};
  const nextBtn = document.getElementById('nextPage'); if(nextBtn) nextBtn.onclick = ()=>{page++; loadEdits();};
}

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

loadEdits();
`;

  return renderLayout({ title: 'Список правок', activeHref: '/edits', user, bodyHtml: body, extraScript: script });
}
