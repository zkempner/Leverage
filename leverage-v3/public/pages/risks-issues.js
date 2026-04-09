import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerRisksIssues() {
  route('/command-center/:id/risks-issues', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Risks & Issues</h1><div id="ri-content">Loading...</div>');
    await loadItems(id);
  });
}

async function loadItems(id) {
  const container = document.getElementById('ri-content');
  try {
    const items = await GET(`/cc/engagements/${id}/risks-issues`);
    const risks = items.filter(i => i.type === 'risk');
    const issues = items.filter(i => i.type === 'issue');

    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-ri">+ Add</button></div>
      <div class="tabs"><div class="tab active" data-tab="all">All (${items.length})</div><div class="tab" data-tab="risk">Risks (${risks.length})</div><div class="tab" data-tab="issue">Issues (${issues.length})</div></div>
      <table><thead><tr><th>Type</th><th>Title</th><th>Category</th><th>Severity</th><th>Likelihood</th><th>Status</th><th>Owner</th><th></th></tr></thead>
      <tbody id="ri-rows">${renderRows(items)}</tbody></table>
    `);

    document.getElementById('add-ri').onclick = () => showModal(id);
    container.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const f = tab.dataset.tab;
        html(document.getElementById('ri-rows'), renderRows(f === 'all' ? items : items.filter(i => i.type === f)));
        wireActions(id, items);
      };
    });
    wireActions(id, items);
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function renderRows(items) {
  if (!items.length) return '<tr><td colspan="8" class="empty">None</td></tr>';
  return items.map(i => `<tr>
    <td>${i.type === 'risk' ? '<span class="badge badge-orange">Risk</span>' : '<span class="badge badge-red">Issue</span>'}</td>
    <td><strong>${esc(i.title)}</strong>${i.description ? `<div style="color:var(--fg2);font-size:12px">${esc(i.description).substring(0,100)}</div>` : ''}</td>
    <td>${esc(i.category || '—')}</td>
    <td>${statusBadge(i.severity)}</td>
    <td>${statusBadge(i.likelihood)}</td>
    <td>${statusBadge(i.status)}</td>
    <td>${esc(i.owner_name || '—')}</td>
    <td style="white-space:nowrap"><button class="btn btn-sm btn-secondary edit-ri" data-id="${i.id}">Edit</button><button class="btn btn-sm btn-danger del-ri" data-id="${i.id}">Del</button></td>
  </tr>`).join('');
}

function wireActions(engId, items) {
  document.querySelectorAll('.edit-ri').forEach(btn => { btn.onclick = () => { const i = items.find(x => x.id == btn.dataset.id); if (i) showModal(engId, i); }; });
  document.querySelectorAll('.del-ri').forEach(btn => { btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${engId}/risks-issues/${btn.dataset.id}`); toast('Deleted'); await loadItems(engId); }; });
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Risk/Issue' : 'Add Risk/Issue', `
    <div class="form-row">
      <div class="form-group"><label>Type *</label><select name="type"><option value="risk" ${item?.type==='risk'?'selected':''}>Risk</option><option value="issue" ${item?.type==='issue'?'selected':''}>Issue</option></select></div>
      <div class="form-group"><label>Category</label><select name="category"><option value="operational" ${item?.category==='operational'?'selected':''}>Operational</option><option value="financial" ${item?.category==='financial'?'selected':''}>Financial</option><option value="legal" ${item?.category==='legal'?'selected':''}>Legal</option><option value="technical" ${item?.category==='technical'?'selected':''}>Technical</option><option value="people" ${item?.category==='people'?'selected':''}>People</option><option value="timeline" ${item?.category==='timeline'?'selected':''}>Timeline</option></select></div>
    </div>
    <div class="form-group"><label>Title *</label><input name="title" required value="${esc(item?.title || '')}"></div>
    <div class="form-group"><label>Description</label><textarea name="description" rows="2">${esc(item?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Severity</label><select name="severity"><option value="medium" ${item?.severity==='medium'?'selected':''}>Medium</option><option value="critical" ${item?.severity==='critical'?'selected':''}>Critical</option><option value="high" ${item?.severity==='high'?'selected':''}>High</option><option value="low" ${item?.severity==='low'?'selected':''}>Low</option></select></div>
      <div class="form-group"><label>Likelihood</label><select name="likelihood"><option value="medium" ${item?.likelihood==='medium'?'selected':''}>Medium</option><option value="critical" ${item?.likelihood==='critical'?'selected':''}>Critical</option><option value="high" ${item?.likelihood==='high'?'selected':''}>High</option><option value="low" ${item?.likelihood==='low'?'selected':''}>Low</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label><select name="status"><option value="open" ${item?.status==='open'?'selected':''}>Open</option><option value="mitigating" ${item?.status==='mitigating'?'selected':''}>Mitigating</option><option value="resolved" ${item?.status==='resolved'?'selected':''}>Resolved</option><option value="accepted" ${item?.status==='accepted'?'selected':''}>Accepted</option></select></div>
      <div class="form-group"><label>Due Date</label><input type="date" name="due_date" value="${item?.due_date?.split('T')[0] || ''}"></div>
    </div>
    <div class="form-group"><label>Mitigation Plan</label><textarea name="mitigation_plan" rows="2">${esc(item?.mitigation_plan || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (item) { await PATCH(`/cc/engagements/${engId}/risks-issues/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/risks-issues`, data); toast('Added'); }
    await loadItems(engId);
  });
}
