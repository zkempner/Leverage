import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, statusBadge, fmtDate, openModal } from '../app.js';

export function registerWorkPlan() {
  route('/command-center/:id/work-plan', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Work Plan</h1><div id="wp-content">Loading...</div>');
    await loadWorkPlan(id);
  });
}

async function loadWorkPlan(id) {
  const container = document.getElementById('wp-content');
  try {
    const data = await GET(`/cc/engagements/${id}/work-plan`);
    const phases = data.phases || data || [];

    html(container, `
      <div class="toolbar">
        <div class="spacer"></div>
        <button class="btn btn-secondary" id="add-phase">+ Phase</button>
        <button class="btn btn-primary" id="add-task">+ Task</button>
      </div>
      <div id="phases-list">${renderPhases(phases)}</div>
    `);

    document.getElementById('add-phase').onclick = () => showPhaseModal(id);
    document.getElementById('add-task').onclick = () => showTaskModal(id, phases);
    wireActions(id, phases);
  } catch (err) {
    html(container, `<div class="empty">Error: ${esc(err.message)}</div>`);
  }
}

function renderPhases(phases) {
  if (!phases.length) return '<div class="empty">No phases yet. Add a phase to get started.</div>';
  return phases.map(p => {
    const tasks = p.tasks || [];
    const done = tasks.filter(t => t.status === 'completed').length;
    const pct = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    return `
    <div class="card">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <h2 style="flex:1;margin:0">${esc(p.name)}</h2>
        ${statusBadge(p.status)}
        <span style="color:var(--fg2);font-size:12px">${done}/${tasks.length} tasks</span>
        <button class="btn btn-sm btn-secondary edit-phase" data-id="${p.id}">Edit</button>
        <button class="btn btn-sm btn-danger del-phase" data-id="${p.id}">Del</button>
      </div>
      <div class="progress-bar" style="margin-bottom:12px"><div class="fill" style="width:${pct}%"></div></div>
      ${tasks.length ? `<table><thead><tr><th>Task</th><th>Workstream</th><th>Owner</th><th>Status</th><th>Priority</th><th>Due</th><th></th></tr></thead><tbody>
        ${tasks.map(t => `<tr>
          <td>${esc(t.task_name)}</td>
          <td>${esc(t.workstream || '—')}</td>
          <td>${esc(t.owner_name || '—')}</td>
          <td>${statusBadge(t.status)}</td>
          <td>${statusBadge(t.priority)}</td>
          <td>${fmtDate(t.due_date)}</td>
          <td style="white-space:nowrap">
            <button class="btn btn-sm btn-secondary edit-task" data-id="${t.id}">Edit</button>
            <button class="btn btn-sm btn-danger del-task" data-id="${t.id}">Del</button>
          </td>
        </tr>`).join('')}
      </tbody></table>` : '<div style="color:var(--fg3);font-size:13px">No tasks in this phase</div>'}
    </div>`;
  }).join('');
}

function wireActions(engId, phases) {
  document.querySelectorAll('.edit-phase').forEach(btn => {
    btn.onclick = () => {
      const p = phases.find(p => p.id == btn.dataset.id);
      if (p) showPhaseModal(engId, p);
    };
  });
  document.querySelectorAll('.del-phase').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this phase and all its tasks?')) return;
      await DELETE(`/cc/engagements/${engId}/work-plan/phases/${btn.dataset.id}`);
      toast('Phase deleted');
      await loadWorkPlan(engId);
    };
  });
  document.querySelectorAll('.edit-task').forEach(btn => {
    btn.onclick = () => {
      for (const p of phases) {
        const t = (p.tasks || []).find(t => t.id == btn.dataset.id);
        if (t) { showTaskModal(engId, phases, t); return; }
      }
    };
  });
  document.querySelectorAll('.del-task').forEach(btn => {
    btn.onclick = async () => {
      if (!confirm('Delete this task?')) return;
      await DELETE(`/cc/engagements/${engId}/work-plan/tasks/${btn.dataset.id}`);
      toast('Task deleted');
      await loadWorkPlan(engId);
    };
  });
}

function showPhaseModal(engId, item = null) {
  openModal(item ? 'Edit Phase' : 'Add Phase', `
    <div class="form-group"><label>Phase Name *</label><input name="name" required value="${esc(item?.name || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Start Date</label><input type="date" name="start_date" value="${item?.start_date?.split('T')[0] || ''}"></div>
      <div class="form-group"><label>End Date</label><input type="date" name="end_date" value="${item?.end_date?.split('T')[0] || ''}"></div>
    </div>
    <div class="form-group"><label>Status</label><select name="status"><option value="not_started" ${item?.status==='not_started'?'selected':''}>Not Started</option><option value="in_progress" ${item?.status==='in_progress'?'selected':''}>In Progress</option><option value="completed" ${item?.status==='completed'?'selected':''}>Completed</option></select></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (item) { await PATCH(`/cc/engagements/${engId}/work-plan/phases/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/work-plan/phases`, data); toast('Phase added'); }
    await loadWorkPlan(engId);
  });
}

function showTaskModal(engId, phases, item = null) {
  openModal(item ? 'Edit Task' : 'Add Task', `
    <div class="form-group"><label>Phase *</label><select name="phase_id" required>${phases.map(p => `<option value="${p.id}" ${item?.phase_id==p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
    <div class="form-group"><label>Task Name *</label><input name="task_name" required value="${esc(item?.task_name || '')}"></div>
    <div class="form-row">
      <div class="form-group"><label>Workstream</label><input name="workstream" value="${esc(item?.workstream || '')}"></div>
      <div class="form-group"><label>Due Date</label><input type="date" name="due_date" value="${item?.due_date?.split('T')[0] || ''}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Status</label><select name="status"><option value="not_started" ${item?.status==='not_started'?'selected':''}>Not Started</option><option value="in_progress" ${item?.status==='in_progress'?'selected':''}>In Progress</option><option value="completed" ${item?.status==='completed'?'selected':''}>Completed</option><option value="blocked" ${item?.status==='blocked'?'selected':''}>Blocked</option><option value="deferred" ${item?.status==='deferred'?'selected':''}>Deferred</option></select></div>
      <div class="form-group"><label>Priority</label><select name="priority"><option value="medium" ${item?.priority==='medium'?'selected':''}>Medium</option><option value="critical" ${item?.priority==='critical'?'selected':''}>Critical</option><option value="high" ${item?.priority==='high'?'selected':''}>High</option><option value="low" ${item?.priority==='low'?'selected':''}>Low</option></select></div>
    </div>
    <div class="form-group"><label>Description</label><textarea name="description" rows="2">${esc(item?.description || '')}</textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    data.phase_id = Number(data.phase_id);
    if (item) { await PATCH(`/cc/engagements/${engId}/work-plan/tasks/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/work-plan/tasks`, data); toast('Task added'); }
    await loadWorkPlan(engId);
  });
}
