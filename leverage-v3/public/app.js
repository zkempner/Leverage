// ── API helpers ──────────────────────────────────────────
export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || res.statusText);
  }
  if (res.status === 204) return null;
  return res.json();
}
export const GET    = (p) => api(p);
export const POST   = (p, body) => api(p, { method: 'POST', body });
export const PATCH  = (p, body) => api(p, { method: 'PATCH', body });
export const DELETE = (p) => api(p, { method: 'DELETE' });

// ── Toast ────────────────────────────────────────────────
export function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast-msg ${type}`;
  el.textContent = msg;
  document.getElementById('toast').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Helpers ──────────────────────────────────────────────
export function $(sel, parent = document) { return parent.querySelector(sel); }
export function $$(sel, parent = document) { return [...parent.querySelectorAll(sel)]; }
export function html(el, h) { el.innerHTML = h; }
export function esc(s) { if (s == null) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }
export function fmtDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
export function fmtCurrency(n) { if (n == null) return '—'; return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }

export function badge(text, color) {
  return `<span class="badge badge-${color || 'gray'}">${esc(text)}</span>`;
}
export function statusBadge(s) {
  const m = {
    active:'green', completed:'blue', on_hold:'yellow', cancelled:'red',
    received:'green', requested:'blue', outstanding:'red', partial:'yellow', na:'gray',
    open:'blue', in_progress:'yellow', closed:'green',
    approved:'green', proposed:'blue', reversed:'red',
    upcoming:'blue', missed:'red',
    not_started:'gray', blocked:'red', deferred:'orange',
    identified:'blue', under_review:'yellow', communicated:'orange',
    draft:'gray', sent:'green', finalized:'green',
    critical:'red', high:'orange', medium:'yellow', low:'gray',
  };
  return badge(s?.replace(/_/g, ' ') || '—', m[s] || 'gray');
}

// ── Modal ────────────────────────────────────────────────
export function openModal(title, contentHtml, onSubmit) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal"><h2>${esc(title)}</h2><form id="modal-form">${contentHtml}<div class="modal-actions"><button type="button" class="btn btn-secondary" id="modal-cancel">Cancel</button><button type="submit" class="btn btn-primary">Save</button></div></form></div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#modal-cancel').onclick = () => overlay.remove();
  overlay.querySelector('.modal-overlay')?.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = Object.fromEntries(fd.entries());
    try { await onSubmit(data); overlay.remove(); } catch (err) { toast(err.message, 'error'); }
  };
  return overlay;
}

// ── Router ───────────────────────────────────────────────
const routes = [];
export function route(pattern, handler) { routes.push({ pattern, handler }); }

function matchRoute(path) {
  for (const r of routes) {
    const keys = [];
    const re = new RegExp('^' + r.pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    const m = path.match(re);
    if (m) {
      const params = {};
      keys.forEach((k, i) => params[k] = m[i + 1]);
      return { handler: r.handler, params };
    }
  }
  return null;
}

export function navigate(path) {
  window.history.pushState(null, '', path);
  render();
}

async function render() {
  const path = window.location.pathname;
  const match = matchRoute(path);
  const main = document.getElementById('main');
  if (!match) {
    // Default: redirect to engagement list
    navigate('/command-center');
    return;
  }
  try {
    await match.handler(main, match.params);
  } catch (err) {
    console.error(err);
    html(main, `<div class="empty"><div class="icon">&#9888;</div>Error loading page<br><small>${esc(err.message)}</small></div>`);
  }
  // Update active nav link
  document.querySelectorAll('#nav a').forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === path);
  });
}

// ── Sidebar nav builder ──────────────────────────────────
export function buildNav(engagementId) {
  const nav = document.getElementById('nav');
  if (!engagementId) {
    html(nav, `
      <div class="section-label">Command Center</div>
      <a href="/command-center">All Engagements</a>
      <a href="/command-center/new">+ New Engagement</a>
    `);
  } else {
    const id = engagementId;
    html(nav, `
      <div class="section-label">Command Center</div>
      <a href="/command-center">&larr; All Engagements</a>
      <div class="section-label">Engagement</div>
      <a href="/command-center/${id}/dashboard">Dashboard</a>
      <a href="/command-center/${id}/drls">DRLs</a>
      <a href="/command-center/${id}/rif">RIF Tracker</a>
      <a href="/command-center/${id}/work-plan">Work Plan</a>
      <a href="/command-center/${id}/timeline">Timeline</a>
      <div class="section-label">Collaboration</div>
      <a href="/command-center/${id}/meetings">Meetings</a>
      <a href="/command-center/${id}/action-items">Action Items</a>
      <a href="/command-center/${id}/decisions">Decisions</a>
      <a href="/command-center/${id}/risks-issues">Risks & Issues</a>
      <div class="section-label">People</div>
      <a href="/command-center/${id}/team">Team</a>
      <a href="/command-center/${id}/stakeholders">Stakeholders</a>
      <div class="section-label">Data & Docs</div>
      <a href="/command-center/${id}/key-metrics">Key Metrics</a>
      <a href="/command-center/${id}/documents">Documents</a>
      <div class="section-label">AI Tools</div>
      <a href="/command-center/${id}/emails">Emails</a>
      <a href="/command-center/${id}/interview-guides">Interview Guides</a>
      <a href="/command-center/${id}/status-reports">Status Reports</a>
    `);
  }
  // Wire up nav clicks for SPA navigation
  nav.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      navigate(a.getAttribute('href'));
    });
  });
  // Highlight current
  const cur = window.location.pathname;
  nav.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === cur));
}

// ── Register all pages ───────────────────────────────────
import { registerEngagementList } from './pages/engagement-list.js';
import { registerNewEngagement } from './pages/new-engagement.js';
import { registerDashboard } from './pages/dashboard.js';
import { registerDrls } from './pages/drls.js';
import { registerRif } from './pages/rif.js';
import { registerWorkPlan } from './pages/work-plan.js';
import { registerTimeline } from './pages/timeline.js';
import { registerMeetings } from './pages/meetings.js';
import { registerActionItems } from './pages/action-items.js';
import { registerDecisions } from './pages/decisions.js';
import { registerRisksIssues } from './pages/risks-issues.js';
import { registerTeam } from './pages/team.js';
import { registerStakeholders } from './pages/stakeholders.js';
import { registerKeyMetrics } from './pages/key-metrics.js';
import { registerDocuments } from './pages/documents.js';
import { registerEmails } from './pages/emails.js';
import { registerInterviewGuides } from './pages/interview-guides.js';
import { registerStatusReports } from './pages/status-reports.js';

registerEngagementList();
registerNewEngagement();
registerDashboard();
registerDrls();
registerRif();
registerWorkPlan();
registerTimeline();
registerMeetings();
registerActionItems();
registerDecisions();
registerRisksIssues();
registerTeam();
registerStakeholders();
registerKeyMetrics();
registerDocuments();
registerEmails();
registerInterviewGuides();
registerStatusReports();

// ── Boot ─────────────────────────────────────────────────
window.addEventListener('popstate', render);
buildNav(null);
render();
