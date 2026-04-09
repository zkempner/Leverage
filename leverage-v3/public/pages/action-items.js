import { route, buildNav, html, esc, GET, POST, PATCH, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerActionItems() {
  route('/command-center/:id/action-items', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Action Items</h1><div id="ai-content">Loading...</div>');
    await loadItems(id);
  });
}

async function loadItems(id) {
  const container = document.getElementById('ai-content');
  try {
    const items = await GET(`/cc/engagements/${id}/action-items`);
    const open = items.filter(i => i.status === 'open' || i.status === 'in_progress').length;

    html(container, `
      <div class="toolbar">
        <span style="color:var(--fg2)">${open} open of ${items.length} total</span>
        <div class="spacer"></div>
        <select id="ai-filter"><option value="">All</option><option value="open">Open</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
        <button class="btn btn-primary" id="add-ai">+ Add Item</button>
      </div>
      <table><thead><tr><th>Description</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th><th></th></tr></thead>
      <tbody id="ai-rows">${renderRows(items)}</tbody></table>
    `);

    document.getElementById('add-ai').onclick = () => showModal(id);
    document.getElementById('ai-filter').onchange = (e) => {
      const v = e.target.value;
      html(document.getElementById('ai-rows'), renderRows(v ? items.filter(i => i.status === v) : items));
      wireActions(id, items);
    };
    wireActions(id, items);
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function renderRows(items) {
  if (!items.length) return '<tr><td colspan="6" class="empty">No action items</td></tr>';
  return items.map(i => `<tr>
    <td>${esc(i.description)}</td>
    <td>${esc(i.owner_name || '—')}</td>
    <td>${fmtDate(i.due_date)}</td>
    <td>${statusBadge(i.priority)}</td>
    <td>${statusBadge(i.status)}</td>
    <td><button class="btn btn-sm btn-secondary edit-ai" data-id="${i.id}">Edit</button></td>
  </tr>`).join('');
}

function wireActions(engId, items) {
  document.querySelectorAll('.edit-ai').forEach(btn => {
    btn.onclick = () => { const i = items.find(x => x.id == btn.dataset.id); if (i) showModal(engId, i); };
  });
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Action Item' : 'Add Action Item', `
    <div class="form-group"><label>Description *</label><textarea name="description" required rows="2">${esc(item?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Owner Name</label><input name="owner_name" value="${esc(item?.owner_name || '')}"></div>
      <div class="form-group"><label>Due Date</label><input type="date" name="due_date" value="${item?.due_date?.split('T')[0] || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Priority</label><select name="priority"><option value="medium" ${item?.priority==='medium'?'selected':''}>Medium</option><option value="critical" ${item?.priority==='critical'?'selected':''}>Critical</option><option value="high" ${item?.priority==='high'?'selected':''}>High</option><option value="low" ${item?.priority==='low'?'selected':''}>Low</option></select></div>
      <div class="form-group"><label>Status</label><select name="status"><option value="open" ${item?.status==='open'?'selected':''}>Open</option><option value="in_progress" ${item?.status==='in_progress'?'selected':''}>In Progress</option><option value="completed" ${item?.status==='completed'?'selected':''}>Completed</option><option value="cancelled" ${item?.status==='cancelled'?'selected':''}>Cancelled</option></select></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea name="notes" rows="2">${esc(item?.notes || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (item) { await PATCH(`/cc/engagements/${engId}/action-items/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/action-items`, data); toast('Added'); }
    await loadItems(engId);
  });
}
