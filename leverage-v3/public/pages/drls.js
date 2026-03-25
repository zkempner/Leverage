import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerDrls() {
  route('/command-center/:id/drls', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Data Request List</h1><div id="drls-content">Loading...</div>');
    await loadDrls(id);
  });
}

async function loadDrls(id) {
  const container = document.getElementById('drls-content');
  try {
    const items = await GET(`/cc/engagements/${id}/drls`);
    const received = items.filter(i => i.status === 'received').length;
    const pct = items.length ? Math.round(received / items.length * 100) : 0;

    html(container, `
      <div class="toolbar">
        <span style="color:var(--fg2)">${items.length} items &middot; ${pct}% received</span>
        <div class="spacer"></div>
        <select id="drl-filter"><option value="">All Statuses</option><option value="requested">Requested</option><option value="received">Received</option><option value="outstanding">Outstanding</option><option value="partial">Partial</option><option value="na">N/A</option></select>
        <button class="btn btn-primary" id="add-drl">+ Add Item</button>
      </div>
      <div class="progress-bar" style="margin-bottom:16px"><div class="fill" style="width:${pct}%"></div></div>
      <table><thead><tr><th>#</th><th>Document</th><th>Category</th><th>Status</th><th>Priority</th><th>Due</th><th>Source</th><th></th></tr></thead>
      <tbody id="drl-rows">${renderRows(items)}</tbody></table>
    `);

    document.getElementById('add-drl').onclick = () => showDrlModal(id);
    document.getElementById('drl-filter').onchange = (e) => {
      const v = e.target.value;
      const filtered = v ? items.filter(i => i.status === v) : items;
      html(document.getElementById('drl-rows'), renderRows(filtered));
      wireRowActions(id);
    };
    wireRowActions(id);
  } catch (err) {
    html(container, `<div class="empty">Error: ${esc(err.message)}</div>`);
  }
}

function renderRows(items) {
  if (!items.length) return '<tr><td colspan="8" class="empty">No items</td></tr>';
  return items.map(i => `<tr>
    <td>${esc(i.item_number)}</td>
    <td>${esc(i.document_name)}</td>
    <td>${esc(i.category || '—')}</td>
    <td>${statusBadge(i.status)}</td>
    <td>${statusBadge(i.priority)}</td>
    <td>${fmtDate(i.due_date)}</td>
    <td>${esc(i.source_contact || '—')}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-sm btn-secondary edit-drl" data-id="${i.id}">Edit</button>
      <button class="btn btn-sm btn-danger del-drl" data-id="${i.id}">Del</button>
    </td>
  </tr>`).join('');
}

function wireRowActions(engId) {
  document.querySelectorAll('.edit-drl').forEach(btn => {
    btn.onclick = async () => {
      const item = await GET(`/cc/engagements/${engId}/drls`).then(all => all.find(i => i.id == btn.dataset.id));
      if (item) showDrlModal(engId, item);
    };
  });
  document.querySelectorAll('.del-drl').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this DRL item?')) return;
      await DELETE(`/cc/engagements/${engId}/drls/${btn.dataset.id}`);
      toast('Item deleted');
      await loadDrls(engId);
    };
  });
}

function showDrlModal(engId, item = null) {
  const isEdit = !!item;
  openModal(isEdit ? 'Edit DRL Item' : 'Add DRL Item', `
    <div class="form-row">
      <div class="form-group"><label>Item Number *</label><input name="item_number" required value="${esc(item?.item_number || '')}"></div>
      <div class="form-group"><label>Document Name *</label><input name="document_name" required value="${esc(item?.document_name || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Category</label><input name="category" value="${esc(item?.category || '')}"></div>
      <div class="form-group"><label>Workstream</label><input name="workstream" value="${esc(item?.workstream || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label><select name="status"><option value="requested" ${item?.status==='requested'?'selected':''}>Requested</option><option value="received" ${item?.status==='received'?'selected':''}>Received</option><option value="outstanding" ${item?.status==='outstanding'?'selected':''}>Outstanding</option><option value="partial" ${item?.status==='partial'?'selected':''}>Partial</option><option value="na" ${item?.status==='na'?'selected':''}>N/A</option></select></div>
      <div class="form-group"><label>Priority</label><select name="priority"><option value="medium" ${item?.priority==='medium'?'selected':''}>Medium</option><option value="critical" ${item?.priority==='critical'?'selected':''}>Critical</option><option value="high" ${item?.priority==='high'?'selected':''}>High</option><option value="low" ${item?.priority==='low'?'selected':''}>Low</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Source Contact</label><input name="source_contact" value="${esc(item?.source_contact || '')}"></div>
      <div class="form-group"><label>Due Date</label><input type="date" name="due_date" value="${item?.due_date?.split('T')[0] || ''}"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea name="notes" rows="2">${esc(item?.notes || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (isEdit) {
      await PATCH(`/cc/engagements/${engId}/drls/${item.id}`, data);
      toast('Item updated');
    } else {
      await POST(`/cc/engagements/${engId}/drls`, data);
      toast('Item added');
    }
    await loadDrls(engId);
  });
}
