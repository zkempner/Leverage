"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Zap,
  Users,
  LayoutDashboard,
  ClipboardList,
  Target,
  PenTool,
  BarChart3,
  FileText,
  Bot,
  Settings,
} from "lucide-react";

const mainNav = [
  { href: "/clients", label: "Clients", icon: Users },
];

interface SidebarProps {
  clientId?: string;
}

const clientNav = (id: string) => [
  { href: `/clients/${id}`, label: "Dashboard", icon: LayoutDashboard },
  { href: `/clients/${id}/onboarding`, label: "Onboarding", icon: ClipboardList },
  { href: `/clients/${id}/strategy`, label: "Strategy", icon: Target },
  { href: `/clients/${id}/content`, label: "Content Studio", icon: PenTool },
  { href: `/clients/${id}/campaigns`, label: "Campaigns", icon: Zap },
  { href: `/clients/${id}/performance`, label: "Performance", icon: BarChart3 },
  { href: `/clients/${id}/reports`, label: "Reports", icon: FileText },
  { href: `/clients/${id}/copilot`, label: "AI Copilot", icon: Bot },
];

export function Sidebar({ clientId }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Zap className="h-6 w-6 text-primary" />
        <span className="text-xl font-bold tracking-tight">Blitz</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Navigation
        </div>
        {mainNav.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}

        {clientId && (
          <>
            <div className="mb-2 mt-6 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Client Workspace
            </div>
            {clientNav(clientId).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>

      <div className="border-t p-4">
        <p className="text-xs text-muted-foreground">Blitz v0.1.0</p>
      </div>
    </aside>
  );
}
