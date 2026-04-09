import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, openModal } from '../app.js';

export function registerTeam() {
  route('/command-center/:id/team', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Team</h1><div id="team-content">Loading...</div>');
    await loadTeam(id);
  });
}

async function loadTeam(id) {
  const container = document.getElementById('team-content');
  try {
    const items = await GET(`/cc/engagements/${id}/team`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-tm">+ Add Member</button></div>
      ${!items.length ? '<div class="empty">No team members yet.</div>' : `
      <div class="card-grid">${items.map(m => `
        <div class="card" style="padding:16px">
          <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
            <strong>${esc(m.name)}</strong>
            <div><button class="btn btn-sm btn-secondary edit-tm" data-id="${m.id}" style="margin-right:4px">Edit</button><button class="btn btn-sm btn-danger del-tm" data-id="${m.id}">Del</button></div>
          </div>
          <div style="color:var(--fg2);font-size:13px">${esc(m.role || m.title || '—')}</div>
          <div style="margin-top:6px">${statusBadge(m.member_type)}</div>
          ${m.email ? `<div style="color:var(--fg2);font-size:12px;margin-top:6px">${esc(m.email)}</div>` : ''}
          ${m.phone ? `<div style="color:var(--fg2);font-size:12px">${esc(m.phone)}</div>` : ''}
          ${m.availability ? `<div style="margin-top:4px"><span class="badge badge-blue">${esc(m.availability.replace(/_/g,' '))}</span></div>` : ''}
        </div>
      `).join('')}</div>`}
    `);
    document.getElementById('add-tm').onclick = () => showModal(id);
    document.querySelectorAll('.edit-tm').forEach(btn => {
      btn.onclick = () => { const m = items.find(i => i.id == btn.dataset.id); if (m) showModal(id, m); };
    });
    document.querySelectorAll('.del-tm').forEach(btn => {
      btn.onclick = async () => { if (!confirm('Remove member?')) return; await DELETE(`/cc/engagements/${id}/team/${btn.dataset.id}`); toast('Removed'); await loadTeam(id); };
    });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Team Member' : 'Add Team Member', `
    <div class="form-row">
      <div class="form-group"><label>Name *</label><input name="name" required value="${esc(item?.name || '')}"></div>
      <div class="form-group"><label>Role</label><input name="role" value="${esc(item?.role || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Email</label><input type="email" name="email" value="${esc(item?.email || '')}"></div>
      <div class="form-group"><label>Phone</label><input name="phone" value="${esc(item?.phone || '')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Type</label><select name="member_type"><option value="am_team" ${item?.member_type==='am_team'?'selected':''}>AM Team</option><option value="client_contact" ${item?.member_type==='client_contact'?'selected':''}>Client Contact</option><option value="pe_sponsor_contact" ${item?.member_type==='pe_sponsor_contact'?'selected':''}>PE Sponsor Contact</option></select></div>
      <div class="form-group"><label>Availability</label><select name="availability"><option value="full_time" ${item?.availability==='full_time'?'selected':''}>Full Time</option><option value="part_time" ${item?.availability==='part_time'?'selected':''}>Part Time</option><option value="as_needed" ${item?.availability==='as_needed'?'selected':''}>As Needed</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Title</label><input name="title" value="${esc(item?.title || '')}"></div>
      <div class="form-group"><label>Company</label><input name="company" value="${esc(item?.company || '')}"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea name="notes" rows="2">${esc(item?.notes || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (item) { await PATCH(`/cc/engagements/${engId}/team/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/team`, data); toast('Member added'); }
    await loadTeam(engId);
  });
}
