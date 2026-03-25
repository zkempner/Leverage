import { route, buildNav, html, esc, GET, POST, DELETE, toast, fmtCurrency, openModal } from '../app.js';

export function registerKeyMetrics() {
  route('/command-center/:id/key-metrics', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Key Metrics</h1><div id="km-content">Loading...</div>');
    await loadMetrics(id);
  });
}

async function loadMetrics(id) {
  const container = document.getElementById('km-content');
  try {
    const items = await GET(`/cc/engagements/${id}/metrics`);
    const categories = ['pnl', 'balance_sheet', 'cash_flow', 'people'];
    const catLabels = { pnl: 'P&L', balance_sheet: 'Balance Sheet', cash_flow: 'Cash Flow', people: 'People / HC' };

    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-km">+ Add Metric</button></div>
      <div class="tabs">${categories.map((c, i) => `<div class="tab ${i === 0 ? 'active' : ''}" data-cat="${c}">${catLabels[c]}</div>`).join('')}</div>
      <div id="km-table"></div>
    `);

    function renderCategory(cat) {
      const filtered = items.filter(m => m.metric_category === cat);
      const el = document.getElementById('km-table');
      if (!filtered.length) { html(el, '<div class="empty">No metrics in this category.</div>'); return; }
      html(el, `<table><thead><tr><th>Metric</th><th>Period</th><th>Value</th><th>Unit</th><th>Notes</th><th></th></tr></thead><tbody>
        ${filtered.map(m => `<tr>
          <td><strong>${esc(m.metric_name)}</strong></td>
          <td>${esc(m.period_label || m.period_type || '—')}</td>
          <td style="font-weight:600">${m.unit === 'currency' ? fmtCurrency(m.value) : esc(m.value)}</td>
          <td>${esc(m.unit || '—')}</td>
          <td style="color:var(--fg2);font-size:12px">${esc(m.notes || '—')}</td>
          <td><button class="btn btn-sm btn-danger del-km" data-id="${m.id}">Del</button></td>
        </tr>`).join('')}
      </tbody></table>`);
      document.querySelectorAll('.del-km').forEach(btn => {
        btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/metrics/${btn.dataset.id}`); toast('Deleted'); await loadMetrics(id); };
      });
    }

    renderCategory('pnl');
    container.querySelectorAll('.tab').forEach(tab => {
      tab.onclick = () => {
        container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderCategory(tab.dataset.cat);
      };
    });

    document.getElementById('add-km').onclick = () => showModal(id);
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showModal(engId) {
  openModal('Add Metric', `
    <div class="form-row">
      <div class="form-group"><label>Metric Name *</label><input name="metric_name" required></div>
      <div class="form-group"><label>Category *</label><select name="metric_category" required><option value="pnl">P&L</option><option value="balance_sheet">Balance Sheet</option><option value="cash_flow">Cash Flow</option><option value="people">People / HC</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Value *</label><input type="number" name="value" step="any" required></div>
      <div class="form-group"><label>Unit</label><select name="unit"><option value="currency">Currency</option><option value="percentage">Percentage</option><option value="count">Count</option><option value="days">Days</option></select></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label>Period Type</label><select name="period_type"><option value="actual">Actual</option><option value="budget">Budget</option><option value="prior_year">Prior Year</option><option value="ltm">LTM</option><option value="projected">Projected</option></select></div>
      <div class="form-group"><label>Period Label</label><input name="period_label" placeholder="e.g. Q1 2025"></div>
    </div>
    <div class="form-group"><label>Notes</label><textarea name="notes" rows="2"></textarea></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    data.value = Number(data.value);
    await POST(`/cc/engagements/${engId}/metrics`, data);
    toast('Metric added');
    await loadMetrics(engId);
  });
}
