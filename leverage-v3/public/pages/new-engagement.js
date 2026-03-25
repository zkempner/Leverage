import { route, navigate, buildNav, html, esc, POST, toast } from '../app.js';

export function registerNewEngagement() {
  route('/command-center/new', async (main) => {
    buildNav(null);
    html(main, `
      <h1>New Engagement</h1>
      <div class="card" style="max-width:640px">
        <form id="eng-form">
          <div class="form-row">
            <div class="form-group"><label>Engagement Name *</label><input name="name" required></div>
            <div class="form-group"><label>Portfolio Company *</label><input name="portfolio_company" required></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>PE Sponsor</label><input name="pe_sponsor"></div>
            <div class="form-group"><label>Industry</label><input name="industry"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Engagement Type</label><input name="engagement_type" placeholder="e.g. Cost Transformation"></div>
            <div class="form-group"><label>Deal Stage</label>
              <select name="deal_stage">
                <option value="">Select...</option>
                <option value="pre_acquisition">Pre-Acquisition</option>
                <option value="post_acquisition">Post-Acquisition</option>
              </select>
            </div>
          </div>
          <div class="form-group"><label>Scope Description</label><textarea name="scope_description" rows="3"></textarea></div>
          <div class="form-row">
            <div class="form-group"><label>Start Date</label><input type="date" name="start_date"></div>
            <div class="form-group"><label>End Date</label><input type="date" name="end_date"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label>Budget</label><input type="number" name="budget" step="1000"></div>
            <div class="form-group"><label>Fee Structure</label><input name="fee_structure"></div>
          </div>
          <div class="form-group"><label>Status</label>
            <select name="status">
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
            <button type="button" class="btn btn-secondary" id="cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Create Engagement</button>
          </div>
        </form>
      </div>
    `);

    document.getElementById('cancel-btn').onclick = () => navigate('/command-center');
    document.getElementById('eng-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      // Clean empties
      Object.keys(data).forEach(k => { if (data[k] === '') delete data[k]; });
      if (data.budget) data.budget = Number(data.budget);
      try {
        const eng = await POST('/cc/engagements', data);
        toast('Engagement created');
        navigate(`/command-center/${eng.id}/dashboard`);
      } catch (err) { toast(err.message, 'error'); }
    };
  });
}
