import { route, buildNav, html, esc, GET, fmtDate, statusBadge } from '../app.js';

export function registerDashboard() {
  route('/command-center/:id/dashboard', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Dashboard</h1><div id="dash">Loading...</div>');

    try {
      const [eng, dash] = await Promise.all([
        GET(`/cc/engagements/${id}`),
        GET(`/cc/engagements/${id}/dashboard`),
      ]);

      const d = dash;
      html(document.getElementById('dash'), `
        <div style="margin-bottom:16px">
          <span style="font-size:18px;font-weight:600">${esc(eng.name)}</span>
          <span style="margin-left:8px">${statusBadge(eng.status)}</span>
          <span style="color:var(--fg2);margin-left:12px">${esc(eng.portfolio_company)}</span>
        </div>
        <div class="card-grid">
          <div class="kpi-card">
            <div class="value">${d.drl_completion ?? 0}%</div>
            <div class="label">DRL Completion</div>
            <div class="progress-bar" style="margin-top:8px"><div class="fill" style="width:${d.drl_completion ?? 0}%"></div></div>
          </div>
          <div class="kpi-card">
            <div class="value">${d.open_action_items ?? 0}</div>
            <div class="label">Open Action Items</div>
          </div>
          <div class="kpi-card">
            <div class="value">${d.upcoming_milestones ?? 0}</div>
            <div class="label">Upcoming Milestones</div>
          </div>
          <div class="kpi-card">
            <div class="value">${d.team_size ?? 0}</div>
            <div class="label">Team Members</div>
          </div>
          <div class="kpi-card">
            <div class="value" style="color:${(d.overdue_items ?? 0) > 0 ? 'var(--red)' : 'var(--green)'}">${d.overdue_items ?? 0}</div>
            <div class="label">Overdue Items</div>
          </div>
          <div class="kpi-card">
            <div class="value">${d.task_completion ?? 0}%</div>
            <div class="label">Task Completion</div>
            <div class="progress-bar" style="margin-top:8px"><div class="fill" style="width:${d.task_completion ?? 0}%"></div></div>
          </div>
        </div>

        ${d.recent_action_items?.length ? `
        <div class="card">
          <h2>Recent Action Items</h2>
          <table><thead><tr><th>Description</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead><tbody>
          ${d.recent_action_items.map(a => `<tr><td>${esc(a.description)}</td><td>${esc(a.owner_name || '—')}</td><td>${fmtDate(a.due_date)}</td><td>${statusBadge(a.priority)}</td><td>${statusBadge(a.status)}</td></tr>`).join('')}
          </tbody></table>
        </div>` : ''}

        ${d.upcoming_milestone_list?.length ? `
        <div class="card">
          <h2>Upcoming Milestones</h2>
          <table><thead><tr><th>Title</th><th>Target Date</th><th>Status</th></tr></thead><tbody>
          ${d.upcoming_milestone_list.map(m => `<tr><td>${esc(m.title)}</td><td>${fmtDate(m.target_date)}</td><td>${statusBadge(m.status)}</td></tr>`).join('')}
          </tbody></table>
        </div>` : ''}
      `);
    } catch (err) {
      html(document.getElementById('dash'), `<div class="empty">Error: ${esc(err.message)}</div>`);
    }
  });
}
