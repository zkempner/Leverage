import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, fmtCurrency, openModal } from '../app.js';

export function registerRif() {
  route('/command-center/:id/rif', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>RIF Tracker</h1><div id="rif-content">Loading...</div>');
    await loadRif(id);
  });
}

async function loadRif(id) {
  const container = document.getElementById('rif-content');
  try {
    const entries = await GET(`/cc/engagements/${id}/rif`);
    const totalSeverance = entries.reduce((s, e) => s + (Number(e.severance_estimate) || 0), 0);

    html(container, `
      <div class="toolbar">
        <span style="color:var(--fg2)">${entries.length} employees &middot; Est. severance: ${fmtCurrency(totalSeverance)}</span>
        <div class="spacer"></div>
        <button class="btn btn-primary" id="add-rif">+ Add Entry</button>
      </div>
      <table><thead><tr><th>Name</th><th>Title</th><th>Department</th><th>Compensation</th><th>Severance Est.</th><th>Status</th><th>Legal</th><th>Union</th><th></th></tr></thead>
      <tbody id="rif-rows">${renderRows(entries)}</tbody></table>
    `);

    document.getElementById('add-rif').onclick = () => showRifModal(id);
    wireActions(id);
  } catch (err) {
    html(container, `<div class="empty">Error: ${esc(err.message)}</div>`);
  }
}

function renderRows(entries) {
  if (!entries.length) return '<tr><td colspan="9" class="empty">No entries</td></tr>';
  return entries.map(e => `<tr>
    <td><strong>${esc(e.employee_name)}</strong></td>
    <td>${esc(e.title || '—')}</td>
    <td>${esc(e.department || '—')}</td>
    <td>${fmtCurrency(e.compensation)}</td>
    <td>${fmtCurrency(e.severance_estimate)}</td>
    <td>${statusBadge(e.status)}</td>
    <td>${e.legal_review_flag ? '<span class="badge badge-red">Yes</span>' : '—'}</td>
    <td>${e.union_flag ? '<span class="badge badge-yellow">Yes</span>' : '—'}</td>
    <td style="white-space:nowrap">
      <button class="btn btn-sm btn-secondary edit-rif" data-id="${e.id}">Edit</button>
      <button class="btn btn-sm btn-danger del-rif" data-id="${e.id}">Del</button>
    </td>
  </tr>`).join('');
}

function wireActions(engId) {
  document.querySelectorAll('.edit-rif').forEach(btn => {
    btn.onclick = async () => {
      const items = await GET(`/cc/engagements/${engId}/rif`);
      const item = items.find(i => i.id == btn.dataset.id);
      if (item) showRifModal(engId, item);
    };
  });
  document.querySelectorAll('.del-rif').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this entry?')) return;
      await DELETE(`/cc/engagements/${engId}/rif/${btn.dataset.id}`);
      toast('Entry deleted');
      await loadRif(engId);
    };
  });
}

function showRifModal(engId, item = null) {
  const isEdit = !!item;
  openModal(isEdit ? 'Edit RIF Entry' : 'Add RIF Entry', `
    <div class="form-row">
      <div class="form-group"><label>Employee Name *</label><input name="employee_name" required value="${esc(item?.employee_name || '')}"></div>
      <div class="form-group"><label>Employee ID</label><input name="employee_id" value="${esc(item?.employee_id || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Title</label><input name="title" value="${esc(item?.title || '')}"></div>
      <div class="form-group"><label>Department</label><input name="department" value="${esc(item?.department || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Compensation</label><input type="number" name="compensation" value="${item?.compensation || ''}"></div>
      <div class="form-group"><label>Severance Estimate</label><input type="number" name="severance_estimate" value="${item?.severance_estimate || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label><select name="status"><option value="identified" ${item?.status==='identified'?'selected':''}>Identified</option><option value="under_review" ${item?.status==='under_review'?'selected':''}>Under Review</option><option value="approved" ${item?.status==='approved'?'selected':''}>Approved</option><option value="communicated" ${item?.status==='communicated'?'selected':''}>Communicated</option><option value="completed" ${item?.status==='completed'?'selected':''}>Completed</option><option value="cancelled" ${item?.status==='cancelled'?'selected':''}>Cancelled</option></select></div>
      <div class="form-group"><label>Location</label><input name="location" value="${esc(item?.location || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Legal Review?</label><select name="legal_review_flag"><option value="0" ${!item?.legal_review_flag?'selected':''}>No</option><option value="1" ${item?.legal_review_flag?'selected':''}>Yes</option></select></div>
      <div class="form-group"><label>Union?</label><select name="union_flag"><option value="0" ${!item?.union_flag?'selected':''}>No</option><option value="1" ${item?.union_flag?'selected':''}>Yes</option></select></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea name="notes" rows="2">${esc(item?.notes || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (data.compensation) data.compensation = Number(data.compensation);
    if (data.severance_estimate) data.severance_estimate = Number(data.severance_estimate);
    data.legal_review_flag = data.legal_review_flag === '1';
    data.union_flag = data.union_flag === '1';
    if (isEdit) { await PATCH(`/cc/engagements/${engId}/rif/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/rif`, data); toast('Added'); }
    await loadRif(engId);
  });
}
