import { BarChart3, Table2 } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Section — bản rút gọn của DashboardShell gốc (Lovable).
 * Bỏ toàn bộ vỏ ngoài (sidebar / header app / footer / logo) vì layout xembaocao
 * (_authenticated/route.tsx) đã cung cấp AppSidebar + AppHeader. Ở đây chỉ giữ:
 * tiêu đề mục, badge trạng thái, và toggle Dashboard/Dạng bảng.
 * Giữ nguyên tên export "DashboardShell" để 3 view không phải sửa import.
 */
export function DashboardShell({
  title,
  description,
  children,
  tableView,
}: {
  title: string;
  description: string;
  children: ReactNode;
  tableView?: ReactNode;
}) {
  const [view, setView] = useState<"dashboard" | "table">("dashboard");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          <span className="size-1.5 rounded-full bg-success" aria-hidden />
          Dữ liệu hợp lệ
        </span>
      </div>

      {tableView && (
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { id: "dashboard", label: "Dashboard", icon: BarChart3 },
              { id: "table", label: "Dạng bảng", icon: Table2 },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setView(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                view === t.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
      )}

      {tableView && view === "table" ? tableView : children}
    </div>
  );
}
