import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Upload, Brush, FolderTree, BarChart3, Calculator,
  BookOpen, Target, DollarSign, FileDown, ChevronLeft, ChevronRight, Menu, Shield,
  Library, Home, Plus, TrendingUp, CalendarClock, Radar, Grid3X3, FileText, AlertTriangle,
  Activity, ShieldAlert, Bell, LayoutGrid, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Engagement } from "@shared/schema";
import { CopilotTrigger } from "@/components/Copilot";

const moduleItems = [
  { path: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "import", label: "Data Import", icon: Upload },
  { path: "cleansing", label: "Data Cleansing", icon: Brush },
  { path: "categorization", label: "Categorization", icon: FolderTree },
  { path: "analysis", label: "Spend Analysis", icon: BarChart3 },
  { path: "spend-flags", label: "Spend Flags", icon: AlertTriangle },
  { path: "tariff-impact", label: "Tariff Impact", icon: Shield },
  { path: "modeling", label: "Savings Modeling", icon: Calculator },
  { path: "assumptions", label: "Assumptions Library", icon: BookOpen },
  { path: "category-strategy", label: "Category Strategy", icon: Grid3X3 },
  { path: "contracts", label: "Contracts", icon: FileText },
  { path: "contract-upload", label: "Contract Intelligence", icon: Upload },
  { path: "supplier-risk", label: "Supplier Risk", icon: ShieldAlert },
  { path: "alerts", label: "Alert Center", icon: Bell },
  { path: "fx-exposure", label: "FX Exposure", icon: Globe },
  { path: "100-day-plan", label: "100-Day Plan", icon: CalendarClock },
  { path: "tracker", label: "Savings Tracker", icon: Target },
  { path: "cashflow", label: "Cash Flow", icon: DollarSign },
  { path: "financial-model", label: "Financial Model", icon: TrendingUp },
  { path: "maturity", label: "Maturity Assessment", icon: Radar },
  { path: "reporting", label: "Reporting & Export", icon: FileDown },
  { path: "market-intel", label: "Market Intelligence", icon: Activity },
  { path: "deliverables", label: "Deliverables", icon: FileDown },
];

export function Layout({
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

  const { data: engagements } = useQuery<Engagement[]>({
    queryKey: ["/api/engagements"],
  });

  const basePath = `/engagements/${engagementId}`;

  const currentModule = moduleItems.find(item => {
    const fullPath = `${basePath}/${item.path}`;
    return location === fullPath || location.startsWith(fullPath + "/");
  });

  const { data: alertCounts } = useQuery<{ total: number; critical: number; unacknowledged: number }>({
    queryKey: [`/api/engagements/${engagementId}/alerts/counts`],
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  return (
    <div className="flex h-screen overflow-hidden bg-background" data-testid="layout-root">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          data-testid="mobile-overlay"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed md:relative z-50 flex flex-col h-full bg-am-navy text-white transition-all duration-200 ${
          collapsed ? "w-16" : "w-60"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}
        data-testid="sidebar"
      >
        {/* Sidebar header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-white/10">
          {!collapsed && (
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer hover:opacity-80">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-label="Leverage logo">
                  <path d="M4 20L12 4L20 20H4Z" stroke="currentColor" strokeWidth="2" fill="none"/>
                  <path d="M8 14H16" stroke="#CF7F00" strokeWidth="2"/>
                </svg>
                <span className="font-bold text-base tracking-wide">LEVERAGE</span>
              </div>
            </Link>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-white/70 hover:text-white hover:bg-white/10 hidden md:flex"
            onClick={() => setCollapsed(!collapsed)}
            data-testid="sidebar-collapse-btn"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Back to engagements */}
        <div className="px-2 pt-2">
          <Link href="/">
            <div
              className="flex items-center gap-3 px-4 py-2 mx-0 rounded-md cursor-pointer text-white/50 hover:text-white hover:bg-white/10 transition-colors"
              data-testid="nav-home"
              onClick={() => setMobileOpen(false)}
            >
              <Home className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="text-xs truncate">All Engagements</span>}
            </div>
          </Link>
        </div>

        {/* Module Nav */}
        <nav className="flex-1 overflow-y-auto py-2" data-testid="sidebar-nav">
          {moduleItems.map((item) => {
            const fullPath = `${basePath}/${item.path}`;
            const isActive = location === fullPath || location.startsWith(fullPath + "/");
            const Icon = item.icon;
            const unreadCount = item.path === "alerts" ? (alertCounts?.unacknowledged ?? 0) : 0;
            return (
              <Link key={item.path} href={fullPath}>
                <div
                  className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md cursor-pointer transition-colors ${
                    isActive
                      ? "bg-am-gold/20 text-am-gold font-medium"
                      : "text-white/70 hover:text-white hover:bg-white/10"
                  }`}
                  data-testid={`nav-${item.path}`}
                  onClick={() => setMobileOpen(false)}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {!collapsed && <span className="text-sm truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}

          {/* Separator */}
          <div className="mx-4 my-2 border-t border-white/10" />

          {/* Reference Library */}
          <Link href={`${basePath}/reference`}>
            <div
              className={`flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md cursor-pointer transition-colors ${
                location.includes("/reference")
                  ? "bg-am-gold/20 text-am-gold font-medium"
                  : "text-white/70 hover:text-white hover:bg-white/10"
              }`}
              data-testid="nav-reference"
              onClick={() => setMobileOpen(false)}
            >
              <Library className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="text-sm truncate">Reference Library</span>}
            </div>
          </Link>
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
        <header className="flex items-center justify-between px-4 md:px-6 h-14 bg-card border-b border-border shrink-0" data-testid="header">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={() => setMobileOpen(true)}
              data-testid="mobile-menu-btn"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="hidden md:block">
              <h1 className="text-sm font-semibold text-foreground">
                {currentModule?.label || (location.includes("/reference") ? "Reference Library" : "Dashboard")}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/portfolio">
              <Button variant="ghost" size="sm" className="gap-1.5 h-8 hidden sm:flex">
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="text-xs">Portfolio</span>
              </Button>
            </Link>
            <CopilotTrigger engagementId={engagementId} />
            <Select
              value={String(engagementId)}
              onValueChange={(v) => {
                if (v === "new") {
                  navigate("/new-engagement");
                } else {
                  onEngagementChange(Number(v));
                }
              }}
            >
              <SelectTrigger className="w-56 text-sm" data-testid="engagement-selector">
                <SelectValue placeholder="Select engagement" />
              </SelectTrigger>
              <SelectContent>
                {(engagements || []).map((e) => (
                  <SelectItem key={e.id} value={String(e.id)} data-testid={`engagement-option-${e.id}`}>
                    {e.name}
                  </SelectItem>
                ))}
                <SelectItem value="new" data-testid="engagement-option-new">
                  <span className="flex items-center gap-1"><Plus className="h-3 w-3" /> New Engagement</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6" data-testid="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}
