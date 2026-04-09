import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerEmails() {
  route('/command-center/:id/emails', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Emails</h1><div id="em-content">Loading...</div>');
    await loadEmails(id);
  });
}

async function loadEmails(id) {
  const container = document.getElementById('em-content');
  try {
    const items = await GET(`/cc/engagements/${id}/emails`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="gen-email">+ Generate Email</button></div>
      ${!items.length ? '<div class="empty">No emails generated yet. Use the generator to create drafts.</div>' : items.map(e => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h2 style="flex:1;margin:0">${esc(e.subject || 'Untitled')}</h2>
            <span class="badge badge-blue">${esc(e.email_type?.replace(/_/g,' ') || '—')}</span>
            ${statusBadge(e.status)}
            <span style="color:var(--fg2);font-size:12px">${fmtDate(e.created_at)}</span>
            <button class="btn btn-sm btn-danger del-em" data-id="${e.id}">Del</button>
          </div>
          <div style="background:var(--bg);border-radius:var(--radius);padding:12px;white-space:pre-wrap;font-size:13px;color:var(--fg2);max-height:200px;overflow-y:auto">${esc(e.body || '')}</div>
          <div style="margin-top:8px">
            <button class="btn btn-sm btn-secondary copy-em" data-body="${esc(e.body || '')}">Copy to Clipboard</button>
            <button class="btn btn-sm btn-secondary mark-sent" data-id="${e.id}" ${e.status==='sent'?'disabled':''}>Mark Sent</button>
          </div>
        </div>
      `).join('')}
    `);
    document.getElementById('gen-email').onclick = () => showGenModal(id);
    document.querySelectorAll('.del-em').forEach(btn => { btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/emails/${btn.dataset.id}`); toast('Deleted'); await loadEmails(id); }; });
    document.querySelectorAll('.copy-em').forEach(btn => { btn.onclick = () => { navigator.clipboard.writeText(btn.dataset.body); toast('Copied!'); }; });
    document.querySelectorAll('.mark-sent').forEach(btn => { btn.onclick = async () => { await PATCH(`/cc/engagements/${id}/emails/${btn.dataset.id}`, { status: 'sent' }); toast('Marked sent'); await loadEmails(id); }; });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showGenModal(engId) {
  openModal('Generate Email', `
    <div class="form-row">
      <div class="form-group"><label>Email Type *</label><select name="email_type" required>
        <option value="drl_followup">DRL Follow-up</option>
        <option value="status_update">Status Update</option>
        <option value="meeting_recap">Meeting Recap</option>
        <option value="introduction">Introduction</option>
        <option value="interview_scheduling">Interview Scheduling</option>
        <option value="escalation">Escalation</option>
        <option value="kickoff">Kickoff</option>
      </select></div>
      <div class="form-group"><label>Tone</label><select name="tone">
        <option value="professional">Professional</option>
        <option value="formal">Formal</option>
        <option value="friendly">Friendly</option>
      </select></div>
    </div>
    <div class="form-group"><label>Additional Context</label><textarea name="context" rows="3" placeholder="Any specific details to include..."></textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    toast('Generating email...', 'success');
    await POST(`/cc/engagements/${engId}/emails/generate`, data);
    toast('Email generated');
    await loadEmails(engId);
  });
}
