import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerTimeline() {
  route('/command-center/:id/timeline', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Timeline & Milestones</h1><div id="tl-content">Loading...</div>');
    await loadTimeline(id);
  });
}

async function loadTimeline(id) {
  const container = document.getElementById('tl-content');
  try {
    const items = await GET(`/cc/engagements/${id}/milestones`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-ms">+ Add Milestone</button></div>
      ${!items.length ? '<div class="empty">No milestones yet.</div>' : `<table><thead><tr><th>Title</th><th>Target Date</th><th>Completed</th><th>Status</th><th></th></tr></thead><tbody>
        ${items.map(m => `<tr>
          <td><strong>${esc(m.title)}</strong>${m.description ? `<div style="color:var(--fg2);font-size:12px">${esc(m.description)}</div>` : ''}</td>
          <td>${fmtDate(m.target_date)}</td>
          <td>${fmtDate(m.completed_date)}</td>
          <td>${statusBadge(m.status)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary edit-ms" data-id="${m.id}">Edit</button>
            <button class="btn btn-sm btn-danger del-ms" data-id="${m.id}">Del</button>
          </td>
        </tr>`).join('')}
      </tbody></table>`}
    `);
    document.getElementById('add-ms').onclick = () => showModal(id);
    document.querySelectorAll('.edit-ms').forEach(btn => {
      btn.onclick = () => { const m = items.find(i => i.id == btn.dataset.id); if (m) showModal(id, m); };
    });
    document.querySelectorAll('.del-ms').forEach(btn => {
      btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/milestones/${btn.dataset.id}`); toast('Deleted'); await loadTimeline(id); };
    });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Milestone' : 'Add Milestone', `
    <div class="form-group"><label>Title *</label><input name="title" required value="${esc(item?.title || '')}"></div>
    <div class="form-group"><label>Description</label><textarea name="description" rows="2">${esc(item?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Target Date</label><input type="date" name="target_date" value="${item?.target_date?.split('T')[0] || ''}"></div>
      <div class="form-group"><label>Completed Date</label><input type="date" name="completed_date" value="${item?.completed_date?.split('T')[0] || ''}"></div>
    </div>
    <div class="form-group"><label>Status</label><select name="status"><option value="upcoming" ${item?.status==='upcoming'?'selected':''}>Upcoming</option><option value="in_progress" ${item?.status==='in_progress'?'selected':''}>In Progress</option><option value="completed" ${item?.status==='completed'?'selected':''}>Completed</option><option value="missed" ${item?.status==='missed'?'selected':''}>Missed</option></select></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (item) { await PATCH(`/cc/engagements/${engId}/milestones/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/milestones`, data); toast('Milestone added'); }
    await loadTimeline(engId);
  });
}
