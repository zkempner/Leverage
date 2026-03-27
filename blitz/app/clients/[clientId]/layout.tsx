"use client";

import { useParams } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const clientId = params.clientId as string;

  return (
    <div className="flex h-screen">
      <Sidebar clientId={clientId} />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
