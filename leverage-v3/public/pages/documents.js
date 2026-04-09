import { route, buildNav, html, esc, GET, POST, PATCH, DELETE, toast, fmtDate, openModal } from '../app.js';

export function registerDocuments() {
  route('/command-center/:id/documents', async (main, { id }) => {
    buildNav(id);
    html(main, '<h1>Documents</h1><div id="docs-content">Loading...</div>');
    await loadDocs(id);
  });
}

async function loadDocs(id) {
  const container = document.getElementById('docs-content');
  try {
    const items = await GET(`/cc/engagements/${id}/documents`);
    const catLabels = { deliverable: 'Deliverable', reference: 'Reference', template: 'Template', data_room: 'Data Room' };
    const catColors = { deliverable: 'green', reference: 'blue', template: 'yellow', data_room: 'orange' };

    html(container, `
      <div class="toolbar"><div class="spacer"></div><button class="btn btn-primary" id="add-doc">+ Add Document</button></div>
      ${!items.length ? '<div class="empty">No documents uploaded yet.</div>' : `
      <table><thead><tr><th>Name</th><th>Category</th><th>Type</th><th>Tags</th><th>Added</th><th></th></tr></thead><tbody>
        ${items.map(d => `<tr>
          <td><strong>${d.file_link ? `<a href="${esc(d.file_link)}" target="_blank">${esc(d.name)}</a>` : esc(d.name)}</strong>${d.description ? `<div style="color:var(--fg2);font-size:12px">${esc(d.description)}</div>` : ''}</td>
          <td><span class="badge badge-${catColors[d.category] || 'gray'}">${esc(catLabels[d.category] || d.category || '—')}</span></td>
          <td>${esc(d.file_type || '—')}</td>
          <td>${(typeof d.tags === 'string' ? JSON.parse(d.tags || '[]') : d.tags || []).map(t => `<span class="badge badge-gray">${esc(t)}</span>`).join(' ')}</td>
          <td>${fmtDate(d.created_at)}</td>
          <td style="white-space:nowrap"><button class="btn btn-sm btn-secondary edit-doc" data-id="${d.id}">Edit</button><button class="btn btn-sm btn-danger del-doc" data-id="${d.id}">Del</button></td>
        </tr>`).join('')}
      </tbody></table>`}
    `);
    document.getElementById('add-doc').onclick = () => showModal(id);
    document.querySelectorAll('.edit-doc').forEach(btn => { btn.onclick = () => { const d = items.find(i => i.id == btn.dataset.id); if (d) showModal(id, d); }; });
    document.querySelectorAll('.del-doc').forEach(btn => { btn.onclick = async () => { if (!confirm('Delete?')) return; await DELETE(`/cc/engagements/${id}/documents/${btn.dataset.id}`); toast('Deleted'); await loadDocs(id); }; });
  } catch (err) { html(container, `<div class="empty">Error: ${esc(err.message)}</div>`); }
}

function showModal(engId, item = null) {
  openModal(item ? 'Edit Document' : 'Add Document', `
    <div class="form-group"><label>Name *</label><input name="name" required value="${esc(item?.name || '')}"></div>
    <div class="form-group"><label>Description</label><textarea name="description" rows="2">${esc(item?.description || '')}</textarea></div>
    <div class="form-row">
      <div class="form-group"><label>Category</label><select name="category"><option value="deliverable" ${item?.category==='deliverable'?'selected':''}>Deliverable</option><option value="reference" ${item?.category==='reference'?'selected':''}>Reference</option><option value="template" ${item?.category==='template'?'selected':''}>Template</option><option value="data_room" ${item?.category==='data_room'?'selected':''}>Data Room</option></select></div>
      <div class="form-group"><label>File Type</label><input name="file_type" value="${esc(item?.file_type || '')}" placeholder="e.g. pdf, xlsx"></div>
    </div>
    <div class="form-group"><label>File Link</label><input name="file_link" value="${esc(item?.file_link || '')}" placeholder="URL or path"></div>
    <div class="form-group"><label>Tags (comma-separated)</label><input name="tags" value="${esc(item?.tags ? (typeof item.tags === 'string' ? JSON.parse(item.tags).join(', ') : item.tags.join(', ')) : '')}"></div>
  `, async (data) => {
    Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
    if (data.tags) data.tags = JSON.stringify(data.tags.split(',').map(s => s.trim()));
    if (item) { await PATCH(`/cc/engagements/${engId}/documents/${item.id}`, data); toast('Updated'); }
    else { await POST(`/cc/engagements/${engId}/documents`, data); toast('Added'); }
    await loadDocs(engId);
  });
}
