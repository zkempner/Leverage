import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerStatusReports() {
  route('/command-center/:id/status-reports', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Status Reports</h1><div id="sr-content">Loading...</div>');
    await loadReports(id);
  });
}

async function loadReports(id) {
  const container = document.getElementById('sr-content');
  try {
    const items = await GET(`/cc/engagements/${id}/status-reports`);
    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="gen-sr">+ Generate Report</button></div>
      ${!items.length ? '<div class="empty">No status reports yet.</div>' : items.map(r => `
        <div class="card">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <h2 style="flex:1;margin:0">Report: ${fmtDate(r.report_date)}</h2>
            <span class="badge badge-blue">${esc(r.report_format || '—')}</span>
            ${statusBadge(r.status)}
            <button class="btn btn-sm btn-secondary copy-sr" data-content="${esc(r.ai_generated_content || '')}">Copy</button>
            <button class="btn btn-sm btn-danger del-sr" data-id="${r.id}">Del</button>
          </div>
          ${r.period_start || r.period_end ? `<div style="color:var(--fg2);font-size:12px;margin-bottom:8px">Period: ${fmtDate(r.period_start)} &mdash; ${fmtDate(r.period_end)}</div>` : ''}
          ${r.ai_generated_content ? `<div style="background:var(--bg);border-radius:var(--radius);padding:12px;white-space:pre-wrap;font-size:13px;color:var(--fg2);max-height:400px;overflow-y:auto">${esc(r.ai_generated_content)}</div>` : ''}
          ${r.accomplishments ? `<div style="margin-top:8px"><strong style="font-size:12px;color:var(--fg3)">Accomplishments</strong><ul style="margin:4px 0 0 16px;color:var(--fg2);font-size:13px">${(typeof r.accomplishments === 'string' ? JSON.parse(r.accomplishments) : r.accomplishments || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
          ${r.next_steps ? `<div style="margin-top:8px"><strong style="font-size:12px;color:var(--fg3)">Next Steps</strong><ul style="margin:4px 0 0 16px;color:var(--fg2);font-size:13px">${(typeof r.next_steps === 'string' ? JSON.parse(r.next_steps) : r.next_steps || []).map(a => `<li>${esc(a)}</li>`).join('')}</ul></div>` : ''}
        </div>
      `).join('')}
    `);
    document.getElementById('gen-sr').onclick = () => showGenModal(id);
    document.querySelectorAll('.del-sr').forEach(btn => { btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/status-reports/${btn.dataset.id}`); toast('Deleted'); await loadReports(id); }; });
    document.querySelectorAll('.copy-sr').forEach(btn => { btn.onclick = () => { navigator.clipboard.writeText(btn.dataset.content); toast('Copied!'); }; });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showGenModal(engId) {
  openModal('Generate Status Report', `
    <div class="form-row">
      <div class="form-group"><label>Report Date</label><input type="date" name="report_date" value="${new Date().toISOString().split('T')[0]}"></div>
      <div class="form-group"><label>Format</label><select name="report_format"><option value="bullet">Bullet Points</option><option value="structured">Structured</option><option value="metrics_narrative">Metrics Narrative</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Period Start</label><input type="date" name="period_start"></div>
      <div class="form-group"><label>Period End</label><input type="date" name="period_end"></div>
    </div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    toast('Generating report...');
    await POST(`/cc/engagements/${engId}/status-reports`, data);
    toast('Report generated');
    await loadReports(engId);
  });
}
