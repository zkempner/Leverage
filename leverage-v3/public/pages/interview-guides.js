import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerInterviewGuides() {
  route('/command-center/:id/interview-guides', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Interview Guides</h1><div id="ig-content">Loading...</div>');
    await loadGuides(id);
  });
}

async function loadGuides(id) {
  const container = document.getElementById('ig-content');
  try {
    const items = await GET(`/cc/engagements/${id}/interview-guides`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-ig">+ Create Guide</button></div>
      ${!items.length ? '<div class="empty">No interview guides yet.</div>' : items.map(g => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h2 style="flex:1;margin:0">${esc(g.title || g.interviewee_name || 'Untitled')}</h2>
            <span class="badge badge-blue">${esc(g.workstream || '—')}</span>
            ${statusBadge(g.status)}
            <button class="btn btn-sm btn-secondary edit-ig" data-id="${g.id}">Edit</button>
            <button class="btn btn-sm btn-danger del-ig" data-id="${g.id}">Del</button>
          </div>
          ${g.interviewee_name ? `<div style="color:var(--fg2);font-size:13px;margin-bottom:4px">Interviewee: ${esc(g.interviewee_name)} ${g.interviewee_role ? `(${esc(g.interviewee_role)})` : ''}</div>` : ''}
          ${g.guide_content ? `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;white-space:pre-wrap;font-size:13px;color:var(--fg2);max-height:300px;overflow-y:auto">${esc(g.guide_content)}</div>` : ''}
        </div>
      `).join('')}
    `);
    document.getElementById('add-ig').onclick = () => showModal(id);
    document.querySelectorAll('.edit-ig').forEach(btn => { btn.onclick = () => { const g = items.find(i => i.id == btn.dataset.id); if (g) showModal(id, g); }; });
    document.querySelectorAll('.del-ig').forEach(btn => { btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/interview-guides/${btn.dataset.id}`); toast('Deleted'); await loadGuides(id); }; });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Interview Guide' : 'Create Interview Guide', `
    <div class="form-group"><label>Title</label><input name="title" value="${esc(item?.title || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Interviewee Name</label><input name="interviewee_name" value="${esc(item?.interviewee_name || '')}"></div>
      <div class="form-group"><label>Interviewee Role</label><input name="interviewee_role" value="${esc(item?.interviewee_role || '')}"></div>
    </div>
    <div class="form-group"><label>Workstream</label><select name="workstream">
      <option value="">Select...</option>
      ${['Finance','Operations','IT','HR','Sales & Marketing','Supply Chain','Legal','Procurement','Strategy','General'].map(w => `<option value="${w}" ${item?.workstream===w?'selected':''}>${w}</option>`).join('')}
    </select></div>
    <div class="form-group"><label>Scope Context</label><textarea name="scope_context" rows="2" placeholder="Key areas to cover...">${esc(item?.scope_context || '')}</textarea></div>
    <div class="form-group"><label>Guide Content</label><textarea name="guide_content" rows="8">${esc(item?.guide_content || '')}</textarea></div>
    <div class="form-group"><label>Status</label><select name="status"><option value="draft" ${item?.status==='draft'?'selected':''}>Draft</option><option value="finalized" ${item?.status==='finalized'?'selected':''}>Finalized</option></select></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (item) { await PATCH(`/cc/engagements/${engId}/interview-guides/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/interview-guides`, data); toast('Guide created'); }
    await loadGuides(engId);
  });
}
