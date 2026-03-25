import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerDecisions() {
  route('/command-center/:id/decisions', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Decisions</h1><div id="dec-content">Loading...</div>');
    await loadDecisions(id);
  });
}

async function loadDecisions(id) {
  const container = document.getElementById('dec-content');
  try {
    const items = await GET(`/cc/engagements/${id}/decisions`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-dec">+ Add Decision</button></div>
      ${!items.length ? '<div class="empty">No decisions recorded yet.</div>' : items.map(d => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h2 style="flex:1;margin:0">${esc(d.title)}</h2>
            ${statusBadge(d.status)}
            <span style="color:var(--fg2);font-size:13px">${fmtDate(d.decision_date)}</span>
            <button class="btn btn-sm btn-secondary edit-dec" data-id="${d.id}">Edit</button>
            <button class="btn btn-sm btn-danger del-dec" data-id="${d.id}">Del</button>
          </div>
          ${d.description ? `<div style="margin-bottom:8px;color:var(--fg2)">${esc(d.description)}</div>` : ''}
          ${d.rationale ? `<div style="margin-bottom:6px"><strong style="font-size:12px;color:var(--fg3)">Rationale</strong><div style="color:var(--fg2);font-size:13px">${esc(d.rationale)}</div></div>` : ''}
          ${d.impact ? `<div style="margin-bottom:6px"><strong style="font-size:12px;color:var(--fg3)">Impact</strong><div style="color:var(--fg2);font-size:13px">${esc(d.impact)}</div></div>` : ''}
          ${d.decided_by ? `<div style="font-size:12px;color:var(--fg3)">Decided by: ${esc(d.decided_by)}</div>` : ''}
        </div>
      `).join('')}
    `);
    document.getElementById('add-dec').onclick = () => showModal(id);
    document.querySelectorAll('.edit-dec').forEach(btn => { btn.onclick = () => { const d = items.find(i => i.id == btn.dataset.id); if (d) showModal(id, d); }; });
    document.querySelectorAll('.del-dec').forEach(btn => { btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/decisions/${btn.dataset.id}`); toast('Deleted'); await loadDecisions(id); }; });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Decision' : 'Add Decision', `
    <div class="form-group"><label>Title *</label><input name="title" required value="${esc(item?.title || '')}"></div>
    <div class="form-group"><label>Description</label><textarea name="description" rows="2">${esc(item?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Decision Date</label><input type="date" name="decision_date" value="${item?.decision_date?.split('T')[0] || ''}"></div>
      <div class="form-group"><label>Decided By</label><input name="decided_by" value="${esc(item?.decided_by || '')}"></div>
    </div>
    <div class="form-group"><label>Rationale</label><textarea name="rationale" rows="2">${esc(item?.rationale || '')}</textarea></div>
    <div class="form-group"><label>Impact</label><textarea name="impact" rows="2">${esc(item?.impact || '')}</textarea></div>
    <div class="form-group"><label>Alternatives Considered</label><textarea name="alternatives_considered" rows="2">${esc(item?.alternatives_considered || '')}</textarea></div>
    <div class="form-group"><label>Status</label><select name="status"><option value="proposed" ${item?.status==='proposed'?'selected':''}>Proposed</option><option value="approved" ${item?.status==='approved'?'selected':''}>Approved</option><option value="reversed" ${item?.status==='reversed'?'selected':''}>Reversed</option></select></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (item) { await PATCH(`/cc/engagements/${engId}/decisions/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/decisions`, data); toast('Added'); }
    await loadDecisions(engId);
  });
}
