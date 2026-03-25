import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, openModal } from '../app.js';

export function registerStakeholders() {
  route('/command-center/:id/stakeholders', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Stakeholders</h1><div id="sh-content">Loading...</div>');
    await loadStakeholders(id);
  });
}

async function loadStakeholders(id) {
  const container = document.getElementById('sh-content');
  try {
    const items = await GET(`/cc/engagements/${id}/stakeholders`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-sh">+ Add Stakeholder</button></div>
      ${!items.length ? '<div class="empty">No stakeholders mapped yet.</div>' : `
      <table><thead><tr><th>Name</th><th>Title</th><th>Company</th><th>Role Type</th><th>Influence</th><th>Support</th><th></th></tr></thead><tbody>
        ${items.map(s => `<tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(s.title || '—')}</td>
          <td>${esc(s.company || '—')}</td>
          <td>${statusBadge(s.role_type)}</td>
          <td>${levelBar(s.influence_level)}</td>
          <td>${levelBar(s.support_level)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary edit-sh" data-id="${s.id}">Edit</button>
            <button class="btn btn-sm btn-danger del-sh" data-id="${s.id}">Del</button>
          </td>
        </tr>`).join('')}
      </tbody></table>`}
    `);
    document.getElementById('add-sh').onclick = () => showModal(id);
    document.querySelectorAll('.edit-sh').forEach(btn => {
      btn.onclick = () => { const s = items.find(i => i.id == btn.dataset.id); if (s) showModal(id, s); };
    });
    document.querySelectorAll('.del-sh').forEach(btn => {
      btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/stakeholders/${btn.dataset.id}`); toast('Deleted'); await loadStakeholders(id); };
    });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function levelBar(n) {
  if (n == null) return '—';
  const pct = Math.min(100, Math.max(0, Number(n)));
  const color = pct >= 70 ? 'var(--green)' : pct >= 40 ? 'var(--yellow)' : 'var(--red)';
  return `<div style="display:flex;align-items:center;gap:6px"><div class="progress-bar" style="width:60px"><div class="fill" style="width:${pct}%;background:${color}"></div></div><span style="font-size:12px;color:var(--fg2)">${pct}</span></div>`;
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Stakeholder' : 'Add Stakeholder', `
    <div class="form-row">
      <div class="form-group"><label>Name *</label><input name="name" required value="${esc(item?.name || '')}"></div>
      <div class="form-group"><label>Title</label><input name="title" value="${esc(item?.title || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Company</label><input name="company" value="${esc(item?.company || '')}"></div>
      <div class="form-group"><label>Role Type</label><select name="role_type"><option value="neutral" ${item?.role_type==='neutral'?'selected':''}>Neutral</option><option value="sponsor" ${item?.role_type==='sponsor'?'selected':''}>Sponsor</option><option value="champion" ${item?.role_type==='champion'?'selected':''}>Champion</option><option value="influencer" ${item?.role_type==='influencer'?'selected':''}>Influencer</option><option value="blocker" ${item?.role_type==='blocker'?'selected':''}>Blocker</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Influence Level (0-100)</label><input type="number" name="influence_level" min="0" max="100" value="${item?.influence_level ?? ''}"></div>
      <div class="form-group"><label>Support Level (0-100)</label><input type="number" name="support_level" min="0" max="100" value="${item?.support_level ?? ''}"></div>
    </div>
    <div class="form-group"><label>Contact Info</label><input name="contact_info" value="${esc(item?.contact_info || '')}"></div>
    <div class="form-group"><label>Notes</label><textarea name="notes" rows="2">${esc(item?.notes || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (data.influence_level) data.influence_level = Number(data.influence_level);
    if (data.support_level) data.support_level = Number(data.support_level);
    if (item) { await PATCH(`/cc/engagements/${engId}/stakeholders/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/stakeholders`, data); toast('Added'); }
    await loadStakeholders(engId);
  });
}
