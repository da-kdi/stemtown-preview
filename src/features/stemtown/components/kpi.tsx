import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

import { cn } from "@/lib/utils";

function useCountUp(target: number, active = true) {
  const [value, setValue] = useState(active ? 0 : target);
  useEffect(() => {
    if (!active) {
      setValue(target);
      return;
    }
    let frame = 0;
    const total = 24;
    const id = window.setInterval(() => {
      frame += 1;
      setValue(target * (frame / total));
      if (frame >= total) {
        setValue(target);
        window.clearInterval(id);
      }
    }, 16);
    return () => window.clearInterval(id);
  }, [target, active]);
  return value;
}

export type SubMetric = {
  label: string;
  value: string;
  hint?: string;
  /** Ghi đè style chữ của giá trị (vd màu vàng cho nhóm "Công ty", màu xanh/đỏ theo % đạt target) — mặc định text-primary. */
  valueStyle?: CSSProperties;
  /** Dòng chữ nhỏ HIỂN THỊ NGAY dưới hàng subMetric (khác `hint` chỉ hiện khi rê chuột) — vd "Target: 640tr". */
  belowText?: string;
};

export function KpiCard({
  label,
  value,
  unit,
  numeric,
  format,
  change,
  subtitle,
  subMetrics,
  icon,
  unavailable,
  valueClassName,
}: {
  label: string;
  value?: string;
  unit?: string;
  numeric?: number;
  format?: (n: number) => string;
  change?: number | null;
  subtitle?: string;
  subMetrics?: SubMetric[];
  icon?: ReactNode;
  unavailable?: boolean;
  /** Ghi đè màu chữ của số hiển thị (mặc định text-primary) — vd "text-destructive" cho số liệu cảnh báo. */
  valueClassName?: string;
}) {
  const animated = useCountUp(numeric ?? 0, numeric !== undefined);
  const display = unavailable
    ? "Chưa đủ dữ liệu để tính chỉ số này."
    : numeric !== undefined && format
      ? format(animated)
      : (value ?? "—");

  return (
    <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon && <span className="rounded-md bg-secondary p-1.5 text-secondary-foreground">{icon}</span>}
      </div>

      {unavailable ? (
        <p className="mt-3 text-sm text-muted-foreground">{display}</p>
      ) : (
        <p className={cn("mt-2 flex items-baseline gap-1 text-2xl font-semibold tracking-tight", valueClassName ?? "text-primary")}>
          {display}
          {unit && <span className="text-sm font-normal text-muted-foreground">{unit}</span>}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {typeof change === "number" && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              change > 0 && "bg-success/10 text-success",
              change < 0 && "bg-destructive/10 text-destructive",
              change === 0 && "bg-secondary text-muted-foreground",
            )}
          >
            {change > 0 ? (
              <ArrowUpRight className="size-3" />
            ) : change < 0 ? (
              <ArrowDownRight className="size-3" />
            ) : (
              <Minus className="size-3" />
            )}
            {`${change > 0 ? "+" : ""}${change.toFixed(1)}%`}
          </span>
        )}
      </div>

      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}

      {subMetrics && subMetrics.length > 0 && (
        <div className="mt-3 grid gap-2 border-t border-dashed border-border pt-3">
          {subMetrics.map((m) => (
            <div key={m.label} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <span className="text-muted-foreground" title={m.hint}>
                  ↳ {m.label}
                </span>
                <span className="font-semibold text-primary" style={m.valueStyle}>
                  {m.value}
                </span>
              </div>
              {m.belowText && (
                <p className="text-right text-[11px] text-muted-foreground">{m.belowText}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
