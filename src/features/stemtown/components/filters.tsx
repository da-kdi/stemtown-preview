import { ChevronDown, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import {
  categoryOptions,
  branchOptions,
  defaultFilters,
  sourceOptions,
  type Filters,
  type TimeUnit,
} from "@/features/stemtown/lib/dashboard-data";
import { cn } from "@/lib/utils";

const TIME_UNITS: { value: TimeUnit; label: string }[] = [
  { value: "day", label: "Ngày" },
  { value: "weekday", label: "Thứ" },
  { value: "week", label: "Tuần" },
  { value: "month", label: "Tháng" },
  { value: "quarter", label: "Quý" },
  { value: "year", label: "Năm" },
];

const fieldClass =
  "h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[140px] flex-1 flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Bộ lọc "Danh mục sản phẩm" CHỌN NHIỀU — bấm mở popover có checkbox thay vì <select> chỉ chọn 1. */
function CategoryMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const label =
    value.length === 0 ? "Tất cả danh mục" : value.length === 1 ? value[0] : `${value.length} danh mục đã chọn`;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(fieldClass, "flex items-center justify-between gap-1 text-left")}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>
      {open && (
        <div className="absolute top-10 left-0 z-30 max-h-72 w-64 overflow-auto rounded-lg border border-border bg-popover p-2 shadow-lg">
          <div className="mb-1 flex gap-2 px-1 text-xs">
            <button
              type="button"
              className="rounded-md border border-input px-2 py-1 hover:bg-secondary"
              onClick={() => onChange([])}
            >
              Tất cả
            </button>
            <button
              type="button"
              className="rounded-md border border-input px-2 py-1 hover:bg-secondary"
              onClick={() => onChange(categoryOptions.slice())}
            >
              Chọn tất cả
            </button>
            <button
              type="button"
              className="ml-auto rounded-md px-2 py-1 text-muted-foreground hover:bg-secondary"
              onClick={() => setOpen(false)}
            >
              Xong
            </button>
          </div>
          {categoryOptions.map((c) => (
            <label
              key={c}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary"
            >
              <input
                type="checkbox"
                checked={value.includes(c)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...value, c] : value.filter((x) => x !== c))
                }
              />
              {c}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Chọn nhanh khoảng ngày                                              */
/* ------------------------------------------------------------------ */

const pad2 = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/** Khoảng [from, to] của 1 tháng, cách tháng hiện tại `offset` tháng (0 = tháng này, -1 = tháng trước). */
function monthRange(offset: number) {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: ymd(from), to: ymd(to) };
}
/** Khoảng [from, to] của 1 quý DƯƠNG LỊCH (Q1 = T1-T3...), cách quý hiện tại `offset` quý. */
function quarterRange(offset: number) {
  const now = new Date();
  const curQStartMonth = Math.floor(now.getMonth() / 3) * 3;
  const from = new Date(now.getFullYear(), curQStartMonth + offset * 3, 1);
  const to = new Date(now.getFullYear(), curQStartMonth + offset * 3 + 3, 0);
  return { from: ymd(from), to: ymd(to) };
}
/** Khoảng [from, to] của 1 năm DƯƠNG LỊCH (T1-T12), cách năm hiện tại `offset` năm. */
function yearRange(offset: number) {
  const now = new Date();
  const y = now.getFullYear() + offset;
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

const DATE_PRESETS: { label: string; range: () => { from: string; to: string } }[] = [
  { label: "Tháng này", range: () => monthRange(0) },
  { label: "Tháng trước", range: () => monthRange(-1) },
  { label: "Quý này", range: () => quarterRange(0) },
  { label: "Quý trước", range: () => quarterRange(-1) },
  { label: "Năm nay", range: () => yearRange(0) },
  { label: "Năm trước", range: () => yearRange(-1) },
];

export function FilterBar({
  filters,
  onChange,
  show = { model: true, branch: true, category: true, source: false },
  crossFilter,
  onClearCrossFilter,
  crossFilters,
  onRemoveCrossFilter,
  branchList,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  show?: { model?: boolean; branch?: boolean; category?: boolean; source?: boolean };
  crossFilter?: string | null;
  onClearCrossFilter?: () => void;
  crossFilters?: { dim: string; label: string }[];
  onRemoveCrossFilter?: (dim: string) => void;
  /** Danh sách chi nhánh riêng cho view (mặc định: gộp B2C + B2B). */
  branchList?: string[];
}) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });
  const branches = branchList ?? branchOptions;
  const chips = crossFilters ?? (crossFilter ? [{ dim: "__legacy", label: crossFilter }] : []);


  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Từ ngày">
          <input
            type="date"
            className={fieldClass}
            value={filters.from}
            onChange={(e) => set({ from: e.target.value })}
          />
        </Field>
        <Field label="Đến ngày">
          <input
            type="date"
            className={fieldClass}
            value={filters.to}
            onChange={(e) => set({ to: e.target.value })}
          />
        </Field>

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Chọn nhanh
          </span>
          <div className="flex flex-wrap gap-1">
            {DATE_PRESETS.map((p) => {
              const r = p.range();
              const active = filters.from === r.from && filters.to === r.to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => set({ from: r.from, to: r.to })}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {show.model && (
          <Field label="Mô hình kinh doanh">
            <select
              className={fieldClass}
              value={filters.model}
              onChange={(e) => set({ model: e.target.value as Filters["model"] })}
            >
              <option value="all">Tất cả</option>
              <option value="b2c">B2C</option>
              <option value="b2b">B2B</option>
            </select>
          </Field>
        )}

        {show.branch && (
          <Field label="Chi nhánh">
            <select
              className={fieldClass}
              value={filters.branch}
              onChange={(e) => set({ branch: e.target.value })}
            >
              <option value="all">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </Field>
        )}

        {show.category && (
          <Field label="Danh mục sản phẩm">
            <CategoryMultiSelect value={filters.category} onChange={(v) => set({ category: v })} />
          </Field>
        )}

        {show.source && (
          <Field label="Nguồn đơn hàng">
            <select
              className={fieldClass}
              value={filters.source}
              onChange={(e) => set({ source: e.target.value })}
            >
              <option value="all">Tất cả nguồn</option>
              {sourceOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
        )}

        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Đơn vị thời gian
          </span>
          <div className="flex rounded-lg border border-input p-0.5">
            {TIME_UNITS.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => set({ timeUnit: u.value })}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  filters.timeUnit === u.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-secondary",
                )}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onChange(defaultFilters);
            onClearCrossFilter?.();
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary"
        >
          <RotateCcw className="size-3.5" /> Đặt lại tất cả
        </button>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-border pt-3">
          <span className="text-xs text-muted-foreground">Đang lọc chéo:</span>
          {chips.map((chip) => (
            <button
              key={chip.dim + chip.label}
              type="button"
              onClick={() =>
                chip.dim === "__legacy" ? onClearCrossFilter?.() : onRemoveCrossFilter?.(chip.dim)
              }
              className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
            >
              {chip.label}
              <X className="size-3" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onClearCrossFilter?.();
              chips.forEach((c) => c.dim !== "__legacy" && onRemoveCrossFilter?.(c.dim));
            }}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Xoá lọc chéo
          </button>
        </div>
      )}
    </div>
  );
}

