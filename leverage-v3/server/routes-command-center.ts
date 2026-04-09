/**
 * COMMAND CENTER — API Routes
 * ~75 endpoints for the CC engagement management tool.
 */
import type { Express, Request, Response } from "express";
import { db } from "./storage";
import { eq, and, desc, asc, sql } from "drizzle-orm";
import {
  cc_engagements, cc_team_members, cc_drl_items, cc_rif_entries,
  cc_work_plan_phases, cc_work_plan_tasks, cc_meetings, cc_action_items,
  cc_emails, cc_interview_guides, cc_stakeholders, cc_risks_issues,
  cc_decisions, cc_milestones, cc_documents, cc_status_reports,
  cc_key_metrics, cc_metric_snapshots,
} from "@shared/schema";

const now = () => new Date().toISOString();

export function registerCommandCenterRoutes(app: Express) {

  // ========================================================================
  // ENGAGEMENTS
  // ========================================================================
  app.get("/api/cc/engagements", (_req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_engagements).orderBy(desc(cc_engagements.created_at)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements", (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body.name || !body.portfolio_company) return res.status(400).json({ message: "name and portfolio_company required" });
      const result = db.insert(cc_engagements).values({
        ...body,
        status: body.status || "active",
        created_at: now(),
        updated_at: now(),
      }).run();
      const created = db.select().from(cc_engagements).where(eq(cc_engagements.id, Number(result.lastInsertRowid))).get();
      res.json(created);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cc/engagements/:id", (req: Request, res: Response) => {
    try {
      const row = db.select().from(cc_engagements).where(eq(cc_engagements.id, Number(req.params.id))).get();
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      db.update(cc_engagements).set({ ...req.body, updated_at: now() }).where(eq(cc_engagements.id, id)).run();
      const updated = db.select().from(cc_engagements).where(eq(cc_engagements.id, id)).get();
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      // Cascade delete all related CC tables
      const tables = [cc_team_members, cc_drl_items, cc_rif_entries, cc_work_plan_tasks, cc_work_plan_phases,
        cc_meetings, cc_action_items, cc_emails, cc_interview_guides, cc_stakeholders, cc_risks_issues,
        cc_decisions, cc_milestones, cc_documents, cc_status_reports, cc_key_metrics, cc_metric_snapshots];
      for (const table of tables) {
        db.delete(table).where(eq((table as any).engagement_id, id)).run();
      }
      db.delete(cc_engagements).where(eq(cc_engagements.id, id)).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // DASHBOARD
  // ========================================================================
  app.get("/api/cc/engagements/:id/dashboard", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const today = new Date().toISOString().split("T")[0];
      const drlTotal = db.select({ count: sql<number>`count(*)` }).from(cc_drl_items).where(eq(cc_drl_items.engagement_id, id)).get();
      const drlReceived = db.select({ count: sql<number>`count(*)` }).from(cc_drl_items).where(sql`engagement_id = ${id} AND status = 'received'`).get();
      const drlOutstanding = db.select({ count: sql<number>`count(*)` }).from(cc_drl_items).where(sql`engagement_id = ${id} AND status IN ('requested','outstanding','partial')`).get();
      const overdueDrls = db.select({ count: sql<number>`count(*)` }).from(cc_drl_items).where(sql`engagement_id = ${id} AND due_date < ${today} AND status NOT IN ('received','na')`).get();
      const actionsOpen = db.select({ count: sql<number>`count(*)` }).from(cc_action_items).where(sql`engagement_id = ${id} AND status IN ('open','in_progress')`).get();
      const actionsCompleted = db.select({ count: sql<number>`count(*)` }).from(cc_action_items).where(sql`engagement_id = ${id} AND status = 'completed'`).get();
      const overdueActions = db.select({ count: sql<number>`count(*)` }).from(cc_action_items).where(sql`engagement_id = ${id} AND due_date < ${today} AND status NOT IN ('completed','cancelled')`).get();
      const milestonesUpcoming = db.select({ count: sql<number>`count(*)` }).from(cc_milestones).where(sql`engagement_id = ${id} AND status IN ('upcoming','in_progress')`).get();
      const milestonesCompleted = db.select({ count: sql<number>`count(*)` }).from(cc_milestones).where(sql`engagement_id = ${id} AND status = 'completed'`).get();
      const rifTotal = db.select({ count: sql<number>`count(*)` }).from(cc_rif_entries).where(eq(cc_rif_entries.engagement_id, id)).get();
      const rifCompleted = db.select({ count: sql<number>`count(*)` }).from(cc_rif_entries).where(sql`engagement_id = ${id} AND status = 'completed'`).get();
      const tasksTotal = db.select({ count: sql<number>`count(*)` }).from(cc_work_plan_tasks).where(eq(cc_work_plan_tasks.engagement_id, id)).get();
      const tasksCompleted = db.select({ count: sql<number>`count(*)` }).from(cc_work_plan_tasks).where(sql`engagement_id = ${id} AND status = 'completed'`).get();
      const teamCount = db.select({ count: sql<number>`count(*)` }).from(cc_team_members).where(eq(cc_team_members.engagement_id, id)).get();

      const total = drlTotal?.count || 0;
      const received = drlReceived?.count || 0;
      res.json({
        drl_total: total, drl_received: received, drl_outstanding: drlOutstanding?.count || 0,
        drl_completion_pct: total > 0 ? Math.round((received / total) * 100) : 0,
        action_items_open: actionsOpen?.count || 0, action_items_completed: actionsCompleted?.count || 0,
        milestones_upcoming: milestonesUpcoming?.count || 0, milestones_completed: milestonesCompleted?.count || 0,
        rif_total: rifTotal?.count || 0, rif_completed: rifCompleted?.count || 0,
        tasks_total: tasksTotal?.count || 0, tasks_completed: tasksCompleted?.count || 0,
        team_count: teamCount?.count || 0,
        overdue_drls: overdueDrls?.count || 0, overdue_actions: overdueActions?.count || 0,
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cc/engagements/:id/alerts/digest", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const today = new Date().toISOString().split("T")[0];
      const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
      const next2Weeks = new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

      const overdueDrls = db.select().from(cc_drl_items).where(sql`engagement_id = ${id} AND due_date < ${today} AND status NOT IN ('received','na')`).all();
      const overdueActions = db.select().from(cc_action_items).where(sql`engagement_id = ${id} AND due_date < ${today} AND status NOT IN ('completed','cancelled')`).all();
      const upcomingMilestones = db.select().from(cc_milestones).where(sql`engagement_id = ${id} AND target_date <= ${nextWeek} AND target_date >= ${today} AND status IN ('upcoming','in_progress')`).all();
      const rifDeadlines = db.select().from(cc_rif_entries).where(sql`engagement_id = ${id} AND (notification_date <= ${next2Weeks} OR last_day <= ${next2Weeks}) AND status NOT IN ('completed','cancelled')`).all();

      res.json({
        overdue_drls: overdueDrls.map(d => ({ item_number: d.item_number, document_name: d.document_name, due_date: d.due_date })),
        overdue_actions: overdueActions.map(a => ({ description: a.description, due_date: a.due_date, owner_name: a.owner_name })),
        upcoming_milestones: upcomingMilestones.map(m => ({ title: m.title, target_date: m.target_date })),
        rif_deadlines: rifDeadlines.map(r => ({ employee_name: r.employee_name, status: r.status, notification_date: r.notification_date, last_day: r.last_day })),
        generated_at: now(),
      });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // TEAM MEMBERS
  // ========================================================================
  app.get("/api/cc/engagements/:id/team", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      let query = db.select().from(cc_team_members).where(eq(cc_team_members.engagement_id, id));
      const rows = query.all().filter((r: any) => !req.query.member_type || r.member_type === req.query.member_type);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/team", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_team_members).values({ ...req.body, engagement_id: Number(req.params.id), status: req.body.status || "active", created_at: now() }).run();
      const row = db.select().from(cc_team_members).where(eq(cc_team_members.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/team/:memberId", (req: Request, res: Response) => {
    try {
      db.update(cc_team_members).set(req.body).where(eq(cc_team_members.id, Number(req.params.memberId))).run();
      const row = db.select().from(cc_team_members).where(eq(cc_team_members.id, Number(req.params.memberId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/team/:memberId", (req: Request, res: Response) => {
    try {
      db.delete(cc_team_members).where(eq(cc_team_members.id, Number(req.params.memberId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // DRL ITEMS
  // ========================================================================
  app.get("/api/cc/engagements/:id/drls", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      let rows = db.select().from(cc_drl_items).where(eq(cc_drl_items.engagement_id, id)).orderBy(asc(cc_drl_items.item_number)).all();
      if (req.query.category) rows = rows.filter((r: any) => r.category === req.query.category);
      if (req.query.status) rows = rows.filter((r: any) => r.status === req.query.status);
      if (req.query.priority) rows = rows.filter((r: any) => r.priority === req.query.priority);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/drls", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const maxNum = db.select({ max: sql<number>`coalesce(max(item_number), 0)` }).from(cc_drl_items).where(eq(cc_drl_items.engagement_id, id)).get();
      const itemNumber = (maxNum?.max || 0) + 1;
      const result = db.insert(cc_drl_items).values({
        ...req.body, engagement_id: id, item_number: req.body.item_number || itemNumber,
        status: req.body.status || "requested", priority: req.body.priority || "medium",
        follow_up_count: 0, materiality_flag: req.body.materiality_flag || 0,
        created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_drl_items).where(eq(cc_drl_items.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/drls/:itemId", (req: Request, res: Response) => {
    try {
      db.update(cc_drl_items).set({ ...req.body, updated_at: now() }).where(eq(cc_drl_items.id, Number(req.params.itemId))).run();
      const row = db.select().from(cc_drl_items).where(eq(cc_drl_items.id, Number(req.params.itemId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/drls/:itemId", (req: Request, res: Response) => {
    try {
      db.delete(cc_drl_items).where(eq(cc_drl_items.id, Number(req.params.itemId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/drls/gap-analysis", (req: Request, res: Response) => {
    try {
      // AI gap analysis — returns placeholder for now; AI service fills this in
      res.json({ gaps: [], message: "Gap analysis requires AI service. Configure ANTHROPIC_API_KEY." });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // RIF ENTRIES
  // ========================================================================
  app.get("/api/cc/engagements/:id/rif", (req: Request, res: Response) => {
    try {
      let rows = db.select().from(cc_rif_entries).where(eq(cc_rif_entries.engagement_id, Number(req.params.id))).all();
      if (req.query.status) rows = rows.filter((r: any) => r.status === req.query.status);
      if (req.query.department) rows = rows.filter((r: any) => r.department === req.query.department);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/rif", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_rif_entries).values({
        ...req.body, engagement_id: Number(req.params.id),
        status: req.body.status || "identified",
        legal_review_flag: req.body.legal_review_flag || 0,
        union_flag: req.body.union_flag || 0,
        rehire_eligibility: req.body.rehire_eligibility || 0,
        created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_rif_entries).where(eq(cc_rif_entries.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/rif/:entryId", (req: Request, res: Response) => {
    try {
      db.update(cc_rif_entries).set({ ...req.body, updated_at: now() }).where(eq(cc_rif_entries.id, Number(req.params.entryId))).run();
      const row = db.select().from(cc_rif_entries).where(eq(cc_rif_entries.id, Number(req.params.entryId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/rif/:entryId", (req: Request, res: Response) => {
    try {
      db.delete(cc_rif_entries).where(eq(cc_rif_entries.id, Number(req.params.entryId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/rif/:entryId/legal-check", (req: Request, res: Response) => {
    try {
      // AI legal check — placeholder
      const entry = db.select().from(cc_rif_entries).where(eq(cc_rif_entries.id, Number(req.params.entryId))).get();
      if (!entry) return res.status(404).json({ message: "Entry not found" });
      res.json({ ai_legal_notes: "Legal analysis requires AI service. Configure ANTHROPIC_API_KEY.", legal_review_flag: true, union_flag: false });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // WORK PLAN
  // ========================================================================
  app.get("/api/cc/engagements/:id/work-plan", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const phases = db.select().from(cc_work_plan_phases).where(eq(cc_work_plan_phases.engagement_id, id)).orderBy(asc(cc_work_plan_phases.sort_order)).all();
      const tasks = db.select().from(cc_work_plan_tasks).where(eq(cc_work_plan_tasks.engagement_id, id)).all();
      res.json({ phases, tasks });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/work-plan/phases", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_work_plan_phases).values({
        ...req.body, engagement_id: Number(req.params.id), status: req.body.status || "not_started",
      }).run();
      const row = db.select().from(cc_work_plan_phases).where(eq(cc_work_plan_phases.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/work-plan/phases/:phaseId", (req: Request, res: Response) => {
    try {
      db.update(cc_work_plan_phases).set(req.body).where(eq(cc_work_plan_phases.id, Number(req.params.phaseId))).run();
      const row = db.select().from(cc_work_plan_phases).where(eq(cc_work_plan_phases.id, Number(req.params.phaseId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/work-plan/phases/:phaseId", (req: Request, res: Response) => {
    try {
      const phaseId = Number(req.params.phaseId);
      db.delete(cc_work_plan_tasks).where(eq(cc_work_plan_tasks.phase_id, phaseId)).run();
      db.delete(cc_work_plan_phases).where(eq(cc_work_plan_phases.id, phaseId)).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/work-plan/tasks", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_work_plan_tasks).values({
        ...req.body, engagement_id: Number(req.params.id),
        status: req.body.status || "not_started", priority: req.body.priority || "medium",
        created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_work_plan_tasks).where(eq(cc_work_plan_tasks.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/work-plan/tasks/:taskId", (req: Request, res: Response) => {
    try {
      db.update(cc_work_plan_tasks).set({ ...req.body, updated_at: now() }).where(eq(cc_work_plan_tasks.id, Number(req.params.taskId))).run();
      const row = db.select().from(cc_work_plan_tasks).where(eq(cc_work_plan_tasks.id, Number(req.params.taskId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/work-plan/tasks/:taskId", (req: Request, res: Response) => {
    try {
      db.delete(cc_work_plan_tasks).where(eq(cc_work_plan_tasks.id, Number(req.params.taskId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // MEETINGS
  // ========================================================================
  app.get("/api/cc/engagements/:id/meetings", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_meetings).where(eq(cc_meetings.engagement_id, Number(req.params.id))).orderBy(desc(cc_meetings.meeting_date)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/meetings", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_meetings).values({
        ...req.body, engagement_id: Number(req.params.id), created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_meetings).where(eq(cc_meetings.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cc/engagements/:id/meetings/:meetingId", (req: Request, res: Response) => {
    try {
      const meeting = db.select().from(cc_meetings).where(eq(cc_meetings.id, Number(req.params.meetingId))).get();
      if (!meeting) return res.status(404).json({ message: "Not found" });
      const actionItems = db.select().from(cc_action_items).where(eq(cc_action_items.meeting_id, meeting.id)).all();
      res.json({ ...meeting, action_items: actionItems });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/meetings/:meetingId", (req: Request, res: Response) => {
    try {
      db.update(cc_meetings).set({ ...req.body, updated_at: now() }).where(eq(cc_meetings.id, Number(req.params.meetingId))).run();
      const row = db.select().from(cc_meetings).where(eq(cc_meetings.id, Number(req.params.meetingId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/meetings/:meetingId", (req: Request, res: Response) => {
    try {
      const meetingId = Number(req.params.meetingId);
      db.delete(cc_action_items).where(eq(cc_action_items.meeting_id, meetingId)).run();
      db.delete(cc_meetings).where(eq(cc_meetings.id, meetingId)).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // ACTION ITEMS
  // ========================================================================
  app.get("/api/cc/engagements/:id/action-items", (req: Request, res: Response) => {
    try {
      let rows = db.select().from(cc_action_items).where(eq(cc_action_items.engagement_id, Number(req.params.id))).orderBy(desc(cc_action_items.created_at)).all();
      if (req.query.status) rows = rows.filter((r: any) => r.status === req.query.status);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/action-items", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_action_items).values({
        ...req.body, engagement_id: Number(req.params.id),
        status: req.body.status || "open", priority: req.body.priority || "medium",
        created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_action_items).where(eq(cc_action_items.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/action-items/:itemId", (req: Request, res: Response) => {
    try {
      db.update(cc_action_items).set({ ...req.body, updated_at: now() }).where(eq(cc_action_items.id, Number(req.params.itemId))).run();
      const row = db.select().from(cc_action_items).where(eq(cc_action_items.id, Number(req.params.itemId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // EMAILS
  // ========================================================================
  app.post("/api/cc/engagements/:id/emails/generate", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_emails).values({
        ...req.body, engagement_id: Number(req.params.id),
        tone: req.body.tone || "professional", status: "draft", created_at: now(),
      }).run();
      const row = db.select().from(cc_emails).where(eq(cc_emails.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cc/engagements/:id/emails", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_emails).where(eq(cc_emails.engagement_id, Number(req.params.id))).orderBy(desc(cc_emails.created_at)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/emails/:emailId", (req: Request, res: Response) => {
    try {
      db.update(cc_emails).set(req.body).where(eq(cc_emails.id, Number(req.params.emailId))).run();
      const row = db.select().from(cc_emails).where(eq(cc_emails.id, Number(req.params.emailId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/emails/:emailId", (req: Request, res: Response) => {
    try {
      db.delete(cc_emails).where(eq(cc_emails.id, Number(req.params.emailId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // INTERVIEW GUIDES
  // ========================================================================
  app.post("/api/cc/engagements/:id/interview-guides", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_interview_guides).values({
        ...req.body, engagement_id: Number(req.params.id),
        status: req.body.status || "draft", created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_interview_guides).where(eq(cc_interview_guides.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cc/engagements/:id/interview-guides", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_interview_guides).where(eq(cc_interview_guides.engagement_id, Number(req.params.id))).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/interview-guides/:guideId", (req: Request, res: Response) => {
    try {
      db.update(cc_interview_guides).set({ ...req.body, updated_at: now() }).where(eq(cc_interview_guides.id, Number(req.params.guideId))).run();
      const row = db.select().from(cc_interview_guides).where(eq(cc_interview_guides.id, Number(req.params.guideId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/interview-guides/:guideId", (req: Request, res: Response) => {
    try {
      db.delete(cc_interview_guides).where(eq(cc_interview_guides.id, Number(req.params.guideId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // KEY METRICS
  // ========================================================================
  app.get("/api/cc/engagements/:id/metrics", (req: Request, res: Response) => {
    try {
      let rows = db.select().from(cc_key_metrics).where(eq(cc_key_metrics.engagement_id, Number(req.params.id))).all();
      if (req.query.metric_category) rows = rows.filter((r: any) => r.metric_category === req.query.metric_category);
      if (req.query.period_type) rows = rows.filter((r: any) => r.period_type === req.query.period_type);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/metrics", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_key_metrics).values({
        ...req.body, engagement_id: Number(req.params.id), created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_key_metrics).where(eq(cc_key_metrics.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/metrics/:metricId", (req: Request, res: Response) => {
    try {
      db.delete(cc_key_metrics).where(eq(cc_key_metrics.id, Number(req.params.metricId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/cc/engagements/:id/metrics/snapshots", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_metric_snapshots).where(eq(cc_metric_snapshots.engagement_id, Number(req.params.id))).orderBy(desc(cc_metric_snapshots.snapshot_date)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/metrics/snapshots", (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const metrics = db.select().from(cc_key_metrics).where(eq(cc_key_metrics.engagement_id, id)).all();
      const result = db.insert(cc_metric_snapshots).values({
        engagement_id: id, snapshot_date: new Date().toISOString().split("T")[0],
        snapshot_label: req.body.snapshot_label || `Snapshot ${new Date().toLocaleDateString()}`,
        metrics_json: JSON.stringify(metrics), created_at: now(),
      }).run();
      const row = db.select().from(cc_metric_snapshots).where(eq(cc_metric_snapshots.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // STAKEHOLDERS (Standard CRUD)
  // ========================================================================
  app.get("/api/cc/engagements/:id/stakeholders", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_stakeholders).where(eq(cc_stakeholders.engagement_id, Number(req.params.id))).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/stakeholders", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_stakeholders).values({ ...req.body, engagement_id: Number(req.params.id), created_at: now() }).run();
      const row = db.select().from(cc_stakeholders).where(eq(cc_stakeholders.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/stakeholders/:sid", (req: Request, res: Response) => {
    try {
      db.update(cc_stakeholders).set(req.body).where(eq(cc_stakeholders.id, Number(req.params.sid))).run();
      const row = db.select().from(cc_stakeholders).where(eq(cc_stakeholders.id, Number(req.params.sid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/stakeholders/:sid", (req: Request, res: Response) => {
    try {
      db.delete(cc_stakeholders).where(eq(cc_stakeholders.id, Number(req.params.sid))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // RISKS & ISSUES (Standard CRUD with type filter)
  // ========================================================================
  app.get("/api/cc/engagements/:id/risks-issues", (req: Request, res: Response) => {
    try {
      let rows = db.select().from(cc_risks_issues).where(eq(cc_risks_issues.engagement_id, Number(req.params.id))).orderBy(desc(cc_risks_issues.created_at)).all();
      if (req.query.type) rows = rows.filter((r: any) => r.type === req.query.type);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/risks-issues", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_risks_issues).values({
        ...req.body, engagement_id: Number(req.params.id),
        status: req.body.status || "open", severity: req.body.severity || "medium",
        likelihood: req.body.likelihood || "medium", created_at: now(), updated_at: now(),
      }).run();
      const row = db.select().from(cc_risks_issues).where(eq(cc_risks_issues.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/risks-issues/:rid", (req: Request, res: Response) => {
    try {
      db.update(cc_risks_issues).set({ ...req.body, updated_at: now() }).where(eq(cc_risks_issues.id, Number(req.params.rid))).run();
      const row = db.select().from(cc_risks_issues).where(eq(cc_risks_issues.id, Number(req.params.rid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/risks-issues/:rid", (req: Request, res: Response) => {
    try {
      db.delete(cc_risks_issues).where(eq(cc_risks_issues.id, Number(req.params.rid))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // DECISIONS (Standard CRUD)
  // ========================================================================
  app.get("/api/cc/engagements/:id/decisions", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_decisions).where(eq(cc_decisions.engagement_id, Number(req.params.id))).orderBy(desc(cc_decisions.decision_date)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/decisions", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_decisions).values({
        ...req.body, engagement_id: Number(req.params.id),
        status: req.body.status || "proposed", created_at: now(),
      }).run();
      const row = db.select().from(cc_decisions).where(eq(cc_decisions.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/decisions/:did", (req: Request, res: Response) => {
    try {
      db.update(cc_decisions).set(req.body).where(eq(cc_decisions.id, Number(req.params.did))).run();
      const row = db.select().from(cc_decisions).where(eq(cc_decisions.id, Number(req.params.did))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/decisions/:did", (req: Request, res: Response) => {
    try {
      db.delete(cc_decisions).where(eq(cc_decisions.id, Number(req.params.did))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // MILESTONES (Standard CRUD)
  // ========================================================================
  app.get("/api/cc/engagements/:id/milestones", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_milestones).where(eq(cc_milestones.engagement_id, Number(req.params.id))).orderBy(asc(cc_milestones.sort_order), asc(cc_milestones.target_date)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/milestones", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_milestones).values({
        ...req.body, engagement_id: Number(req.params.id),
        status: req.body.status || "upcoming", sort_order: req.body.sort_order || 0, created_at: now(),
      }).run();
      const row = db.select().from(cc_milestones).where(eq(cc_milestones.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/milestones/:mid", (req: Request, res: Response) => {
    try {
      db.update(cc_milestones).set(req.body).where(eq(cc_milestones.id, Number(req.params.mid))).run();
      const row = db.select().from(cc_milestones).where(eq(cc_milestones.id, Number(req.params.mid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/milestones/:mid", (req: Request, res: Response) => {
    try {
      db.delete(cc_milestones).where(eq(cc_milestones.id, Number(req.params.mid))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // DOCUMENTS (Standard CRUD)
  // ========================================================================
  app.get("/api/cc/engagements/:id/documents", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_documents).where(eq(cc_documents.engagement_id, Number(req.params.id))).orderBy(desc(cc_documents.created_at)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/documents", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_documents).values({
        ...req.body, engagement_id: Number(req.params.id), created_at: now(),
      }).run();
      const row = db.select().from(cc_documents).where(eq(cc_documents.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/documents/:docId", (req: Request, res: Response) => {
    try {
      db.update(cc_documents).set(req.body).where(eq(cc_documents.id, Number(req.params.docId))).run();
      const row = db.select().from(cc_documents).where(eq(cc_documents.id, Number(req.params.docId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/documents/:docId", (req: Request, res: Response) => {
    try {
      db.delete(cc_documents).where(eq(cc_documents.id, Number(req.params.docId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // STATUS REPORTS
  // ========================================================================
  app.get("/api/cc/engagements/:id/status-reports", (req: Request, res: Response) => {
    try {
      const rows = db.select().from(cc_status_reports).where(eq(cc_status_reports.engagement_id, Number(req.params.id))).orderBy(desc(cc_status_reports.report_date)).all();
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/cc/engagements/:id/status-reports", (req: Request, res: Response) => {
    try {
      const result = db.insert(cc_status_reports).values({
        ...req.body, engagement_id: Number(req.params.id),
        report_format: req.body.report_format || "structured",
        status: req.body.status || "draft", created_at: now(),
      }).run();
      const row = db.select().from(cc_status_reports).where(eq(cc_status_reports.id, Number(result.lastInsertRowid))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/cc/engagements/:id/status-reports/:reportId", (req: Request, res: Response) => {
    try {
      db.update(cc_status_reports).set(req.body).where(eq(cc_status_reports.id, Number(req.params.reportId))).run();
      const row = db.select().from(cc_status_reports).where(eq(cc_status_reports.id, Number(req.params.reportId))).get();
      res.json(row);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/cc/engagements/:id/status-reports/:reportId", (req: Request, res: Response) => {
    try {
      db.delete(cc_status_reports).where(eq(cc_status_reports.id, Number(req.params.reportId))).run();
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ========================================================================
  // AI KICKOFF
  // ========================================================================
  app.post("/api/cc/engagements/:id/kickoff", (req: Request, res: Response) => {
    try {
      res.json({ message: "AI Kickoff requires ANTHROPIC_API_KEY. Configure it to enable AI-powered kickoff.", drlCount: 0, phaseCount: 0, taskCount: 0, guideCount: 0 });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
