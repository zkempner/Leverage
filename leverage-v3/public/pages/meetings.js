import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerMeetings() {
  route('/command-center/:id/meetings', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Meetings</h1><div id="meetings-content">Loading...</div>');
    await loadMeetings(id);
  });
}

async function loadMeetings(id) {
  const container = document.getElementById('meetings-content');
  try {
    const items = await GET(`/cc/engagements/${id}/meetings`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-meeting">+ Add Meeting</button></div>
      ${!items.length ? '<div class="empty">No meetings recorded yet.</div>' : items.map(m => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h2 style="flex:1;margin:0">${esc(m.title)}</h2>
            <span class="badge badge-blue">${esc(m.meeting_type?.replace(/_/g,' ') || '—')}</span>
            <span style="color:var(--fg2);font-size:13px">${fmtDate(m.meeting_date)}</span>
            <button class="btn btn-sm btn-secondary edit-meeting" data-id="${m.id}">Edit</button>
            <button class="btn btn-sm btn-danger del-meeting" data-id="${m.id}">Del</button>
          </div>
          ${m.attendees ? `<div style="color:var(--fg2);font-size:12px;margin-bottom:8px">Attendees: ${esc(typeof m.attendees === 'string' ? m.attendees : JSON.parse(m.attendees || '[]').join(', '))}</div>` : ''}
          ${m.ai_summary ? `<div style="margin-bottom:8px"><strong style="font-size:12px;color:var(--fg3)">Summary</strong><div style="color:var(--fg2);font-size:13px">${esc(m.ai_summary)}</div></div>` : ''}
          ${m.key_takeaways ? `<div><strong style="font-size:12px;color:var(--fg3)">Key Takeaways</strong><ul style="margin:4px 0 0 16px;color:var(--fg2);font-size:13px">${(typeof m.key_takeaways === 'string' ? JSON.parse(m.key_takeaways || '[]') : m.key_takeaways || []).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        </div>
      `).join('')}
    `);
    document.getElementById('add-meeting').onclick = () => showMeetingModal(id);
    document.querySelectorAll('.edit-meeting').forEach(btn => {
      btn.onclick = async () => {
        const m = items.find(i => i.id == btn.dataset.id);
        if (m) showMeetingModal(id, m);
      };
    });
    document.querySelectorAll('.del-meeting').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Delete this meeting?')) return;
        await DELETE(`/cc/engagements/${id}/meetings/${btn.dataset.id}`);
        toast('Meeting deleted');
        await loadMeetings(id);
      };
    });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showMeetingModal(engId, item = null) {
  openModal(item ? 'Edit Meeting' : 'Add Meeting', `
    <div class="form-group"><label>Title *</label><input name="title" required value="${esc(item?.title || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Date *</label><input type="date" name="meeting_date" required value="${item?.meeting_date?.split('T')[0] || ''}"></div>
      <div class="form-group"><label>Type</label><select name="meeting_type"><option value="internal" ${item?.meeting_type==='internal'?'selected':''}>Internal</option><option value="client" ${item?.meeting_type==='client'?'selected':''}>Client</option><option value="steerco" ${item?.meeting_type==='steerco'?'selected':''}>SteerCo</option><option value="interview" ${item?.meeting_type==='interview'?'selected':''}>Interview</option></select></div>
    </div>
    <div class="form-group"><label>Attendees (comma-separated)</label><input name="attendees" value="${esc(item?.attendees ? (typeof item.attendees === 'string' ? JSON.parse(item.attendees).join(', ') : item.attendees.join(', ')) : '')}"></div>
    <div class="form-group"><label>Location</label><input name="location" value="${esc(item?.location || '')}"></div>
    <div class="form-group"><label>Notes / Transcript</label><textarea name="raw_input" rows="4">${esc(item?.raw_input || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (data.attendees) data.attendees = JSON.stringify(data.attendees.split(',').map(s => s.trim()));
    if (item) { await PATCH(`/cc/engagements/${engId}/meetings/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/meetings`, data); toast('Meeting added'); }
    await loadMeetings(engId);
  });
}
