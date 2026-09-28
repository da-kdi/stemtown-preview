import { Info } from "lucide-react";

import {
  COMPARE_FULL_LABEL,
  COMPARE_HINT,
  COMPARE_LABEL,
  availableCompareModes,
  type CompareMode,
} from "@/features/stemtown/lib/compare";
import type { TimeUnit } from "@/features/stemtown/lib/dashboard-data";
import { formatPercent } from "@/features/stemtown/lib/format";
import { cn } from "@/lib/utils";

const ALL: CompareMode[] = ["wow", "mom", "qoq", "yoy"];

/** Nút bật/tắt so sánh kỳ; chỉ kỳ hợp lệ với đơn vị thời gian mới bấm được. */
export function CompareToggle({
  unit,
  mode,
  onChange,
}: {
  unit: TimeUnit;
  mode: CompareMode;
  onChange: (m: CompareMode) => void;
}) {
  const allowed = availableCompareModes(unit);

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex rounded-lg border border-input p-0.5">
        {ALL.map((m) => {
          const enabled = allowed.includes(m);
          const active = enabled && mode === m;
          return (
            <button
              key={m}
              type="button"
              disabled={!enabled}
              aria-pressed={active}
              title={enabled ? COMPARE_FULL_LABEL[m] : COMPARE_HINT}
              onClick={() => onChange(active ? "none" : m)}
              className={cn(
                "rounded-md px-2 py-1 text-[11px] font-semibold transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : enabled
                    ? "text-muted-foreground hover:bg-secondary"
                    : "cursor-not-allowed text-muted-foreground/40",
              )}
            >
              {COMPARE_LABEL[m]}
            </button>
          );
        })}
      </div>
      {allowed.length === 0 && (
        <span
          className="inline-flex items-center text-muted-foreground"
          title={COMPARE_HINT}
          aria-label={COMPARE_HINT}
        >
          <Info className="size-3.5" />
        </span>
      )}
    </div>
  );
}

/** Hiển thị mức tăng/giảm so với kỳ trước trong tooltip. */
export function CompareRow({
  mode,
  prev,
  delta,
  format,
}: {
  mode: CompareMode;
  prev: number | null;
  delta: number | null;
  format: (n: number) => string;
}) {
  if (mode === "none") return null;
  return (
    <div className="mt-1 border-t border-dashed border-border pt-1">
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-muted-foreground">{COMPARE_FULL_LABEL[mode]}</span>
        <span className="ml-auto font-medium tabular-nums">
          {prev === null ? "Không đủ dữ liệu kỳ trước" : format(prev)}
        </span>
      </div>
      {prev !== null && (
        <div className="flex items-center gap-2 py-0.5">
          <span className="text-muted-foreground">Biến động</span>
          <span
            className={cn(
              "ml-auto font-semibold tabular-nums",
              delta === null ? "text-muted-foreground" : delta < 0 ? "text-destructive" : "text-primary",
            )}
          >
            {delta === null ? "—" : `${delta > 0 ? "+" : ""}${formatPercent(delta)}`}
          </span>
        </div>
      )}
    </div>
  );
}
