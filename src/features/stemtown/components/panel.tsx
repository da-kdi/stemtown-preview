import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { TOTAL_COLOR } from "@/features/stemtown/components/chart-kit";

export const EMPTY_TEXT = "Không có dữ liệu phù hợp với bộ lọc hiện tại.";
export const LOADING_TEXT = "Đang tải dữ liệu...";
export const ERROR_TEXT = "Không thể tải dữ liệu. Vui lòng thử lại.";
export const UNAVAILABLE_TEXT = "Chưa đủ dữ liệu để tính chỉ số này.";

export function Panel({
  title,
  subtitle,
  code,
  action,
  isEmpty,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  code?: string;
  action?: ReactNode;
  isEmpty?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-border bg-card p-4 shadow-xs", className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold" title={title}>
            {title}
          </h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          {action}
          {code && (
            <span className="rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {code}
            </span>
          )}
        </div>
      </div>
      {isEmpty ? (
        <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">{EMPTY_TEXT}</p>
      ) : (
        children
      )}
    </section>
  );
}

export function InsightList({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {items.map((t) => (
        <li
          key={t}
          className="flex gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-2 text-sm font-medium"
          style={{ color: TOTAL_COLOR }}
        >
          <span className="mt-1 size-1.5 shrink-0 rounded-full" style={{ background: TOTAL_COLOR }} aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}
