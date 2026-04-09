import { route, navigate, buildNav, html, esc, GET, DELETE, toast, statusBadge, fmtDate } from '../app.js';

export function registerEngagementList() {
  route('/command-center', async (main) => {
    buildNav(null);
    html(main, '<h1>Command Center</h1><div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="new-eng">+ New Engagement</button></div><div id="eng-list"><div class="empty">Loading...</div></div>');

    document.getElementById('new-eng').onclick = () => navigate('/command-center/new');

    try {
      const engs = await GET('/cc/engagements');
      const list = document.getElementById('eng-list');
      if (!engs || engs.length === 0) {
        html(list, '<div class="empty"><div class="icon">&#128203;</div>No engagements yet.<br>Create one to get started.</div>');
        return;
      }
      html(list, `<table><thead><tr><th>Name</th><th>Portfolio Company</th><th>PE Sponsor</th><th>Status</th><th>Deal Stage</th><th>Start</th><th>End</th><th></th></tr></thead><tbody>${engs.map(e => `
        <tr data-id="${e.id}" class="eng-row" style="cursor:pointer">
          <td><strong>${esc(e.name)}</strong></td>
          <td>${esc(e.portfolio_company)}</td>
          <td>${esc(e.pe_sponsor || '—')}</td>
          <td>${statusBadge(e.status)}</td>
          <td>${esc(e.deal_stage?.replace(/_/g,' ') || '—')}</td>
          <td>${fmtDate(e.start_date)}</td>
          <td>${fmtDate(e.end_date)}</td>
          <td><button class="btn btn-sm btn-danger del-eng" data-id="${e.id}">Delete</button></td>
        </tr>
      `).join('')}</tbody></table>`);

      list.querySelectorAll('.eng-row').forEach(row => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.del-eng')) return;
          navigate(`/command-center/${row.dataset.id}/dashboard`);
        });
      });
      list.querySelectorAll('.del-eng').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this engagement and all its data?')) return;
          await DELETE(`/cc/engagements/${btn.dataset.id}`);
          toast('Engagement deleted');
          navigate('/command-center');
        });
      });
    } catch (err) {
      html(document.getElementById('eng-list'), `<div class="empty">Error: ${esc(err.message)}</div>`);
    }
  });
}
