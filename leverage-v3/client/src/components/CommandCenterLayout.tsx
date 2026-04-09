import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, TrendingUp, Users, UserCircle, UserMinus,
  ClipboardList, Calendar, FileSearch, SearchCheck, FolderOpen,
  MessageSquare, CheckSquare, Scale, Mail, ClipboardCheck, FileText,
  AlertTriangle, ChevronLeft, ChevronRight, Menu, Home, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface CCEngagement {
  id: number;
  name: string;
  client_name: string;
  status: string;
}

interface DashboardData {
  overdue_drls?: number;
  overdue_action_items?: number;
  overdue_risks?: number;
  total_overdue?: number;
}

interface ModuleGroup {
  label: string;
  items: ModuleItem[];
}

interface ModuleItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeKey?: keyof DashboardData;
}

const moduleGroups: ModuleGroup[] = [
  {
    label: "Overview",
    items: [
      { path: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { path: "key-metrics", label: "Key Metrics", icon: TrendingUp },
    ],
  },
  {
    label: "People",
    items: [
      { path: "team", label: "Working Team", icon: Users },
      { path: "stakeholders", label: "Stakeholders", icon: UserCircle },
      { path: "rif", label: "RIF Tracker", icon: UserMinus },
    ],
  },
  {
    label: "Planning",
    items: [
      { path: "work-plan", label: "Work Plan", icon: ClipboardList },
      { path: "timeline", label: "Timeline", icon: Calendar },
    ],
  },
  {
    label: "Data Collection",
    items: [
      { path: "drls", label: "DRL Tracker", icon: FileSearch, badgeKey: "overdue_drls" },
      { path: "drl-gaps", label: "DRL Gap Analysis", icon: SearchCheck },
      { path: "documents", label: "Documents", icon: FolderOpen },
    ],
  },
  {
    label: "Collaboration",
    items: [
      { path: "meetings", label: "Meeting Notes", icon: MessageSquare },
      { path: "action-items", label: "Action Items", icon: CheckSquare, badgeKey: "overdue_action_items" },
      { path: "decisions", label: "Decision Log", icon: Scale },
    ],
  },
  {
    label: "AI Tools",
    items: [
      { path: "emails", label: "Email Generator", icon: Mail },
      { path: "interview-guides", label: "Interview Guides", icon: ClipboardCheck },
      { path: "status-reports", label: "Status Reports", icon: FileText },
    ],
  },
  {
    label: "Risk",
    items: [
      { path: "risks-issues", label: "Risks & Issues", icon: AlertTriangle, badgeKey: "overdue_risks" },
    ],
  },
];

const allModuleItems = moduleGroups.flatMap(g => g.items);

export function CommandCenterLayout({
  children,
  engagementId,
  onEngagementChange,
}: {
  children: React.ReactNode;
  engagementId: number;
  onEngagementChange: (id: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location, navigate] = useLocation();

  const { data: engagements } = useQuery<CCEngagement[]>({
    queryKey: ["/api/cc/engagements"],
  });

  const { data: dashboardData } = useQuery<DashboardData>({
    queryKey: [`/api/cc/engagements/${engagementId}/dashboard`],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const basePath = `/command-center/${engagementId}`;

  const currentModule = allModuleItems.find(item => {
    const fullPath = `${basePath}/${item.path}`;
    return location === fullPath || location.startsWith(fullPath + "/");
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="cc-layout-root">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          data-testid="cc-mobile-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-50 flex flex-col h-full bg-am-navy text-white transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        data-testid="cc-sidebar"
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/10">
          {!collapsed && (
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Command Center logo">
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
                  <rect x="6" y="6" width="5" height="5" rx="1" fill="#CF7F00" />
                  <rect x="13" y="6" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" />
                  <rect x="6" y="13" width="5" height="5" rx="1" fill="currentColor" opacity="0.5" />
                  <rect x="13" y="13" width="5" height="5" rx="1" fill="#CF7F00" />
                </svg>
                <span className="font-bold text-xs tracking-wide">COMMAND CENTER</span>
              </div>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10 hidden md:flex"
            onClick={() => setCollapsed(!collapsed)}
            data-testid="cc-sidebar-collapse-btn"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Back to Home */}
        <div className="px-2 pt-2">
          <Link href="/">
            <div
              className="flex items-center gap-3 px-4 py-2 mx-0 rounded-md cursor-pointer text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              data-testid="cc-nav-home"
              onClick={() => setMobileOpen(false)}
            >
              <Home className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="text-xs truncate">Back to Home</span>}
            </div>
          </Link>
        </div>

        {/* Module Nav */}
        <nav className="flex-1 overflow-y-auto py-2" data-testid="cc-sidebar-nav">
          {moduleGroups.map((group, groupIndex) => (
            <div key={group.label}>
              {groupIndex > 0 && (
                <div className="mx-4 my-2 border-t border-white/10" />
              )}
              {!collapsed && (
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                    {group.label}
                  </span>
                </div>
              )}
              {group.items.map((item) => {
                const fullPath = `${basePath}/${item.path}`;
                const isActive = location === fullPath || location.startsWith(fullPath + "/");
                const Icon = item.icon;
                const badgeCount = item.badgeKey && dashboardData ? (dashboardData[item.badgeKey] ?? 0) : 0;
                return (
                  <Link key={item.path} href={fullPath}>
                    <div
                      className={`flex items-center gap-3 px-4 py-2 mx-2 rounded-md cursor-pointer transition-colors ${
                        isActive
                          ? "bg-am-gold/20 text-am-gold font-medium"
                          : "text-white/70 hover:text-white hover:bg-white/10"
                      }`}
                      data-testid={`cc-nav-${item.path}`}
                      onClick={() => setMobileOpen(false)}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && (
                        <span className="text-sm truncate flex-1">{item.label}</span>
                      )}
                      {!collapsed && badgeCount > 0 && (
                        <Badge
                          variant="destructive"
                          className="h-5 min-w-[20px] px-1.5 text-[10px] font-bold"
                        >
                          {badgeCount}
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        {!collapsed && (
          <div className="p-3 border-t border-white/10">
          </div>
        )}
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top header */}
        <header className="flex items-center justify-between px-4 md:px-6 h-14 bg-card border-b border-border shrink-0" data-testid="cc-header">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              data-testid="cc-mobile-menu-btn"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden md:block">
              <h1 className="text-sm font-semibold text-foreground">
                {currentModule?.label || "Dashboard"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Select
              value={String(engagementId)}
              onValueChange={(v) => {
                if (v === "new") {
                  navigate("/command-center/new");
                } else {
                  onEngagementChange(Number(v));
                }
              }}
            >
              <SelectTrigger className="w-56 text-sm" data-testid="cc-engagement-selector">
                <SelectValue placeholder="Select engagement" />
              </SelectTrigger>
              <SelectContent>
                {(engagements || []).map((e) => (
                  <SelectItem key={e.id} value={String(e.id)} data-testid={`cc-engagement-option-${e.id}`}>
                    {e.name}
                  </SelectItem>
                ))}
                <SelectItem value="new" data-testid="cc-engagement-option-new">
                  <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> New Engagement</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="cc-main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
