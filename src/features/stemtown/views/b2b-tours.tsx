import { AlertTriangle, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, RotateCcw } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CHART_COLORS, TooltipBox, TooltipRow, YCategoryTick, axisProps } from "@/features/stemtown/components/chart-kit";
import { FactTable, type Column } from "@/features/stemtown/components/fact-table";
import { ImportDataBar } from "@/features/stemtown/components/import-data";
import { KpiCard } from "@/features/stemtown/components/kpi";
import { EMPTY_TEXT, Panel, SectionHeader } from "@/features/stemtown/components/panel";
import { bucketLabel, replaceTourRows, tourRows } from "@/features/stemtown/lib/dashboard-data";
import { formatNumber, formatShort } from "@/features/stemtown/lib/format";
import {
  clearImportedTours,
  downloadTourTemplate,
  loadImportedTours,
  parseTourFile,
  saveImportedTours,
} from "@/features/stemtown/lib/tour-import";
import {
  TOUR_RULES,
  QUICK_RANGES,
  WEEKDAYS,
  addDays,
  buoiLoad,
  commercialTours,
  dayInfo,
  daySlots,
  dm,
  enrichTours,
  hhmm,
  monthLabel,
  monthRange,
  monthShort,
  mondayOf,
  quickRange,
  reconcileStatus,
  todayVN,
  weekdayIdx,
  weeksOfMonth,
  type DayInfo,
  type DateRange,
  type RecStatus,
  type TourItem,
  type TourKind,
} from "@/features/stemtown/lib/tour-rules";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Màu cố định theo CHỈ SỐ (giữ nguyên ở mọi chart của trang này)       */
/* ------------------------------------------------------------------ */
/** Cam = chú ý / vượt ngưỡng sức chứa — chỉ dùng cho cảnh báo. */
const WARN = CHART_COLORS.accent;
const mix = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, transparent)`;
const KIND_LABEL: Record<TourKind, string> = { tour: "Tour", guest: "Khách mời, CBQL", block: "Sự kiện chặn lịch" };
const fTr = (v: number) => `${formatNumber(v / 1_000_000, v < 100_000_000 ? 1 : 0)}tr`;
const fK = (v: number) => `${formatNumber(Math.round(v / 1000))}k`;
const toDMY = (s: string) => `${s.slice(8, 10)}-${s.slice(5, 7)}-${s.slice(2, 4)}`;
const selectCls = "h-9 min-w-40 rounded-md border border-input bg-card px-3 text-sm";

/* ================================================================== */
/* Trang Lịch tour B2B: 2 tab con Tổng quan / Lịch tour                */
/* ================================================================== */

export function TourSection() {
  const [version, setVersion] = useState(0);
  const [imported, setImported] = useState(false);
  const [tab, setTab] = useState<"overview" | "schedule">("overview");
  const today = useMemo(() => todayVN(), []);

  const apply = useCallback((raw: Record<string, unknown>[] | null) => {
    replaceTourRows(raw);
    setImported(Boolean(raw));
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const stored = loadImportedTours();
    if (stored) apply(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => enrichTours(tourRows, today), [version, today]);

  return (
    <>
      <SectionHeader
        title="Lịch tour B2B"
        subtitle="Dựa trên lịch tham quan đã xếp (kể cả chưa nghiệm thu). Nguồn dữ liệu riêng, doanh thu ở đây là doanh thu dự kiến, không tính vào doanh thu B2B nghiệm thu."
        icon={<CalendarClock className="size-4" />}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1" role="tablist">
          {(
            [
              { id: "overview", label: "Tổng quan", icon: LayoutGrid },
              { id: "schedule", label: "Lịch tour", icon: CalendarDays },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                tab === t.id ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <t.icon className="size-4" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <ImportDataBar
        onImported={apply}
        imported={imported}
        title="Cập nhật dữ liệu Lịch tour"
        description='Đủ các cột gốc của sheet "Lịch tour B2B". Cột "Ngày tham quan" nhập dạng dd/MM/yyyy (vd 31/12/2025). Sheet gốc có 2 cột trùng tên "Note" nên cột cuối đặt là "Note 2".'
        parseFile={parseTourFile}
        saveRows={saveImportedTours}
        clearRows={clearImportedTours}
        downloadTemplate={downloadTourTemplate}
        templateLabel="Template Lịch tour"
      />

      {/* Giữ cả 2 tab trong DOM để đổi tab không mất trạng thái lọc/tuần đang xem */}
      <div hidden={tab !== "overview"}>
        <TourOverview key={`o-${version}`} items={items} today={today} />
      </div>
      <div hidden={tab !== "schedule"}>
        <TourSchedule key={`s-${version}`} items={items} today={today} active={tab === "schedule"} />
      </div>
    </>
  );
}

/* ================================================================== */
/* TAB 1 — Tổng quan                                                   */
/* ================================================================== */

/** Bộ lọc khoảng thời gian Từ ngày/Đến ngày + lọc nhanh + đặt lại — cùng style FilterBar B2B/B2C. */
function TourRangeFilter({
  range,
  setRange,
  today,
  resetTo,
  onReset,
  extra,
}: {
  range: DateRange;
  setRange: (r: DateRange) => void;
  today: string;
  resetTo: DateRange;
  onReset?: () => void;
  extra?: ReactNode;
}) {
  const allActive = range.from === resetTo.from && range.to === resetTo.to;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-xs">
      <label className="grid gap-1 text-xs text-muted-foreground">
        Từ ngày
        <input type="date" className={selectCls} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Đến ngày
        <input type="date" className={selectCls} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </label>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Lọc nhanh</span>
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setRange(resetTo)}
            className={cn(
              "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
              allActive ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-secondary",
            )}
          >
            Toàn bộ thời gian
          </button>
          {QUICK_RANGES.map((r) => {
            const rr = quickRange(r.key, today);
            const active = range.from === rr.from && range.to === rr.to;
            return (
              <button
                key={r.key}
                type="button"
                onClick={() => setRange(rr)}
                className={cn(
                  "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-secondary",
                )}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      {extra}
      <button
        type="button"
        onClick={() => {
          setRange(resetTo);
          onReset?.();
        }}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary"
      >
        <RotateCcw className="size-3.5" /> Đặt lại tất cả
      </button>
    </div>
  );
}

/* Màu cố định theo chỉ số ở tab Tổng quan */
const OC = { dt: CHART_COLORS.primary, tour: CHART_COLORS.dark, hs: CHART_COLORS.support } as const;
const SALE_NONE = "(Chưa có sale)";

/** Cấp học suy từ tên trường — cùng cách chia với phần Nghiệm thu (segmentOf/schoolLevel). */
function levelOfTour(r: TourItem): string {
  const lower = r.schoolName.toLowerCase();
  const up = r.schoolName.toUpperCase();
  if (lower.includes("công ty")) return "Công ty";
  if (lower.includes("cao đẳng") || lower.includes("đại học")) return "Khác";
  if (lower.includes("th-thcs-thpt") || lower.includes("thcs-thpt") || lower.includes("liên cấp")) return "Liên cấp";
  if (up.startsWith("MN") || up.includes("MẦM NON") || up.includes("MẪU GIÁO")) return "Mầm non/Mẫu giáo";
  if (up.startsWith("TH ") || up.includes("TIỂU HỌC")) return "Tiểu học";
  if (up.includes("THCS") || up.includes("TRUNG HỌC CƠ SỞ")) return "THCS";
  if (up.includes("THPT")) return "THPT";
  return "Khác";
}

type Grp = { name: string; n: number; hs: number; dt: number };
type Tot = { n: number; hs: number; dt: number };
function groupTours(rs: TourItem[], keyFn: (r: TourItem) => string | null): Grp[] {
  const m = new Map<string, Grp>();
  rs.forEach((r) => {
    const k = keyFn(r);
    if (k === null) return;
    const g = m.get(k) ?? { name: k, n: 0, hs: 0, dt: 0 };
    g.n += 1;
    g.hs += r.students;
    g.dt += r.revenue;
    m.set(k, g);
  });
  return Array.from(m.values());
}
const totalOf = (rs: TourItem[]): Tot => ({ n: rs.length, hs: rs.reduce((a, r) => a + r.students, 0), dt: rs.reduce((a, r) => a + r.revenue, 0) });

/** Tooltip chung: số lượt tour, số học sinh, doanh thu dự kiến — mỗi chỉ số kèm % trên tổng và số tổng. */
function GroupTooltip({ g, tot, label }: { g: { n: number; hs: number; dt: number }; tot: Tot; label: string }) {
  return (
    <TooltipBox label={label}>
      <TooltipRow color={OC.tour} name="Số lượt tour" value={g.n} unit="tour" share={tot.n ? (g.n / tot.n) * 100 : undefined} />
      <TooltipRow color={OC.hs} name="Số học sinh" value={g.hs} unit="HS" share={tot.hs ? (g.hs / tot.hs) * 100 : undefined} />
      <TooltipRow color={OC.dt} name="Doanh thu dự kiến" value={g.dt} share={tot.dt ? (g.dt / tot.dt) * 100 : undefined} />
      <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">
        Tổng: {formatNumber(tot.n)} tour, {formatNumber(tot.hs)} HS, {fTr(tot.dt)}
      </p>
    </TooltipBox>
  );
}

type DimMetric = "sale" | "level" | "school";
const DIM_CFG: Record<DimMetric, { label: string; keyFn: (r: TourItem) => string | null; top?: number; order?: string[] }> = {
  sale: { label: "Sales", keyFn: (r) => r.sale ?? SALE_NONE, top: 10 },
  level: { label: "Cấp học", keyFn: levelOfTour },
  school: { label: "Trường", keyFn: (r) => r.schoolName, top: 10 },
};
type TimeMetric = "dt" | "n" | "hs";
const TIME_CFG: Record<TimeMetric, { label: string; color: string; fmt: (v: number) => string }> = {
  dt: { label: "Doanh thu dự kiến", color: OC.dt, fmt: (v) => fTr(v) },
  n: { label: "Số tour dự kiến", color: OC.tour, fmt: (v) => `${formatNumber(v)} tour` },
  hs: { label: "Tổng số học sinh dự kiến", color: OC.hs, fmt: (v) => `${formatNumber(v)} HS` },
};
const REC_ORDER: RecStatus[] = ["Chưa đi", "Chưa nghiệm thu", "Đã nghiệm thu"];
const REC_COLOR: Record<RecStatus, string> = { "Chưa đi": CHART_COLORS.axis, "Chưa nghiệm thu": WARN, "Đã nghiệm thu": "#2e9e5b" };

type OvSel = { month?: string; weekday?: number; dimKey?: DimMetric; dimVal?: string; rec?: RecStatus };
const CHART_H = 250;

function TourOverview({ items, today }: { items: TourItem[]; today: string }) {
  const refYear = today.slice(0, 4);
  const defaultRange = useMemo<DateRange>(() => {
    const ds = items.filter((r) => r.date).map((r) => r.date as string).sort();
    return ds.length ? { from: ds[0] as string, to: ds[ds.length - 1] as string } : quickRange("fyThis", today);
  }, [items, today]);
  const [range, setRange] = useState<DateRange>(defaultRange);
  const [statuses, setStatuses] = useState<Set<RecStatus>>(() => new Set());
  const [sel, setSel] = useState<OvSel>({});
  const [timeMetric, setTimeMetric] = useState<TimeMetric>("dt");
  const toggle = <K extends keyof OvSel>(k: K, v: OvSel[K]) => setSel((s) => (s[k] === v ? { ...s, [k]: undefined } : { ...s, [k]: v }));

  const base = useMemo(
    () =>
      commercialTours(items, "").filter(
        (r) => r.date && r.date >= range.from && r.date <= range.to && (statuses.size === 0 || statuses.has(reconcileStatus(r))),
      ),
    [items, range, statuses],
  );

  const rowsExcept = useCallback(
    (...skip: (keyof OvSel)[]) =>
      base.filter(
        (r) =>
          (skip.includes("month") || !sel.month || r.month === sel.month) &&
          (skip.includes("weekday") || sel.weekday === undefined || weekdayIdx(r.date as string) === sel.weekday) &&
          (skip.includes("dimVal") || !sel.dimKey || DIM_CFG[sel.dimKey].keyFn(r) === sel.dimVal) &&
          (skip.includes("rec") || !sel.rec || reconcileStatus(r) === sel.rec),
      ),
    [base, sel],
  );

  const rows = useMemo(() => rowsExcept(), [rowsExcept]);
  const tot = useMemo(() => totalOf(rows), [rows]);
  const saleCount = useMemo(() => new Set(rows.filter((r) => r.sale).map((r) => r.sale)).size, [rows]);

  const monthKeys = useMemo(() => {
    const ms = Array.from(new Set(base.map((r) => r.month))).sort();
    return ms.length ? monthRange(ms[0] as string, ms[ms.length - 1] as string) : [];
  }, [base]);

  /** 1 chart theo thời gian cho cả 3 chỉ số — toggle đổi dataKey, không đổi trục/loại chart. */
  const timeData = useMemo(() => {
    const rs = rowsExcept("month", "weekday");
    return monthKeys.map((m) => {
      const l = rs.filter((r) => r.month === m);
      const t = totalOf(l);
      return { m, label: monthShort(m, refYear), dt: t.dt, n: t.n, hs: t.hs };
    });
  }, [rowsExcept, monthKeys, refYear]);
  const timeTot = useMemo(() => timeData.reduce((a, r) => ({ dt: a.dt + r.dt, n: a.n + r.n, hs: a.hs + r.hs }), { dt: 0, n: 0, hs: 0 }), [timeData]);

  /** 4 chart cơ cấu RIÊNG BIỆT — Sales/Cấp học/Phân khúc giá/Trường là 4 trường dữ liệu khác nhau,
   *  không phải các mức của cùng 1 phân cấp, nên không gộp chung 1 toggle mà tách rõ 4 chart. */
  const dimRows = rowsExcept("dimVal");
  const dimDataByKey = useMemo(() => {
    const out = {} as Record<DimMetric, Grp[]>;
    (Object.keys(DIM_CFG) as DimMetric[]).forEach((k) => {
      const cfg = DIM_CFG[k];
      const g = groupTours(dimRows, cfg.keyFn);
      let list = cfg.order ? cfg.order.map((name) => g.find((x) => x.name === name) ?? { name, n: 0, hs: 0, dt: 0 }) : [...g].sort((a, b) => b.n - a.n);
      if (cfg.top) list = list.slice(0, cfg.top);
      out[k] = list;
    });
    return out;
  }, [dimRows]);
  const dimTotByKey = useMemo(() => {
    const out = {} as Record<DimMetric, Tot>;
    (Object.keys(DIM_CFG) as DimMetric[]).forEach((k) => {
      out[k] = totalOf(dimRows.filter((r) => DIM_CFG[k].keyFn(r) !== null));
    });
    return out;
  }, [dimRows]);

  const planAct = useMemo(() => {
    const rs = rowsExcept("month", "weekday");
    return monthKeys.map((m) => {
      const l = rs.filter((r) => r.month === m);
      const w = l.filter((r) => r.actualStudents !== null);
      return {
        m,
        label: monthShort(m, refYear),
        n: l.length,
        k: w.length,
        plan: l.length ? l.reduce((a, r) => a + r.students, 0) : null,
        act: w.length ? w.reduce((a, r) => a + (r.actualStudents ?? 0), 0) : null,
      };
    });
  }, [rowsExcept, monthKeys, refYear]);

  /** Heatmap Số tour theo Tháng (hàng) × Thứ (cột). */
  const heat = useMemo(() => {
    const rs = rowsExcept("month", "weekday");
    const cnt = new Map<string, number[]>();
    rs.forEach((r) => {
      const a = cnt.get(r.month) ?? [0, 0, 0, 0, 0, 0, 0];
      const i = weekdayIdx(r.date as string);
      a[i] = (a[i] ?? 0) + 1;
      cnt.set(r.month, a);
    });
    const ms = Array.from(cnt.keys()).sort();
    const max = Math.max(1, ...ms.flatMap((m) => cnt.get(m) as number[]));
    return { ms, cnt, max };
  }, [rowsExcept]);

  /* ---------------- Đối chiếu vận hành: Tiến độ × Nghiệm thu ---------------- */
  const recRows = useMemo(() => rowsExcept("rec"), [rowsExcept]);
  const recCounts = useMemo(() => {
    const m: Record<RecStatus, number> = { "Chưa đi": 0, "Đã nghiệm thu": 0, "Chưa nghiệm thu": 0 };
    recRows.forEach((r) => {
      m[reconcileStatus(r)] += 1;
    });
    return m;
  }, [recRows]);
  const doneTotal = recCounts["Đã nghiệm thu"] + recCounts["Chưa nghiệm thu"];
  const backlog = useMemo(
    () =>
      recRows
        .filter((r) => reconcileStatus(r) === "Chưa nghiệm thu" && r.date)
        .map((r) => ({ ...r, daysAgo: Math.round((new Date(today).getTime() - new Date(r.date as string).getTime()) / 86400000) }))
        .sort((a, b) => b.daysAgo - a.daysAgo),
    [recRows, today],
  );

  const chips = (
    [
      sel.month ? ["month", `Tháng: ${monthLabel(sel.month)}`] : null,
      sel.weekday !== undefined ? ["weekday", `Thứ: ${WEEKDAYS[sel.weekday]}`] : null,
      sel.dimKey ? ["dimVal", `${DIM_CFG[sel.dimKey].label}: ${sel.dimVal}`] : null,
      sel.rec ? ["rec", `Trạng thái: ${sel.rec}`] : null,
    ] as ([keyof OvSel, string] | null)[]
  ).filter((x): x is [keyof OvSel, string] => x !== null);

  const empty = (v: number) => (v === 0 ? "" : formatNumber(v));

  const extraFilter = (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tiến độ (chọn nhiều)</span>
      <div className="flex flex-wrap gap-1">
        {REC_ORDER.map((s) => {
          const on = statuses.has(s);
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setStatuses((cur) => {
                  const n = new Set(cur);
                  if (n.has(s)) n.delete(s);
                  else n.add(s);
                  return n;
                })
              }
              className={cn(
                "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                on ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-secondary",
              )}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <TourRangeFilter
        range={range}
        setRange={setRange}
        today={today}
        resetTo={defaultRange}
        onReset={() => {
          setStatuses(new Set());
          setSel({});
        }}
        extra={extraFilter}
      />
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Đang lọc chéo:</span>
          {chips.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSel((s) => ({ ...s, [k]: undefined }))} className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 font-medium text-primary">
              {l} ✕
            </button>
          ))}
          <button type="button" onClick={() => setSel({})} className="text-muted-foreground underline">
            Bỏ lọc chéo
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Doanh thu dự kiến" value={tot.n ? formatNumber(tot.dt / 1_000_000, tot.dt < 100_000_000 ? 1 : 0) : "—"} unit="tr" change={null} />
        <KpiCard label="Số lượt tour dự kiến" value={formatNumber(tot.n)} unit="tour" change={null} />
        <KpiCard label="Tổng số học sinh dự kiến" value={tot.n ? formatNumber(tot.hs) : "—"} unit="HS" change={null} />
        <KpiCard label="Số Sales phụ trách" value={formatNumber(saleCount)} unit="sale" change={null} />
      </div>

      {/* Hàng 1: Xu hướng theo thời gian (toggle 3 chỉ số) + Đối chiếu tiến độ/nghiệm thu */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title={`${TIME_CFG[timeMetric].label} theo thời gian`} code="CH-TOUR-O1" isEmpty={timeData.every((r) => r[timeMetric] === 0)}>
          <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            {(Object.keys(TIME_CFG) as TimeMetric[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTimeMetric(k)}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", timeMetric === k ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60")}
              >
                {TIME_CFG[k].label.replace(" theo thời gian", "").replace(" dự kiến", "")}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={timeData} margin={{ top: 16, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v: number) => (timeMetric === "dt" ? formatShort(v) : formatNumber(v))} width={46} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as (typeof timeData)[number];
                  const v = row[timeMetric];
                  const sum = timeTot[timeMetric];
                  return (
                    <TooltipBox label={monthLabel(row.m)}>
                      <TooltipRow color={TIME_CFG[timeMetric].color} name={TIME_CFG[timeMetric].label} value={v} unit={timeMetric === "dt" ? undefined : timeMetric === "n" ? "tour" : "HS"} share={sum ? (v / sum) * 100 : undefined} />
                      <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">Tổng các tháng: {TIME_CFG[timeMetric].fmt(sum)}</p>
                    </TooltipBox>
                  );
                }}
              />
              <Bar dataKey={timeMetric} fill={TIME_CFG[timeMetric].color} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: { m?: string }) => toggle("month", d?.m)}>
                {timeData.map((r) => (
                  <Cell key={r.m} fill={TIME_CFG[timeMetric].color} fillOpacity={sel.month && sel.month !== r.m ? 0.3 : 1} />
                ))}
                <LabelList dataKey={timeMetric} position="top" formatter={(v: number) => (v === 0 ? "" : TIME_CFG[timeMetric].fmt(v))} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Đối chiếu Tiến độ & Nghiệm thu"
          subtitle="Tiến độ chỉ còn Done/Chưa đi. Trong Done, tách theo đã khớp được BienBanID (Đã nghiệm thu) hay chưa."
          code="CH-TOUR-O2"
          isEmpty={tot.n === 0}
        >
          <div className="flex h-5 overflow-hidden rounded-none">
            {REC_ORDER.map((s) => {
              const v = recCounts[s];
              if (!v) return null;
              const pct = tot.n ? (v / tot.n) * 100 : 0;
              return (
                <button
                  key={s}
                  type="button"
                  title={`${s}: ${formatNumber(v)} tour (${formatNumber(Math.round(pct))}%)`}
                  onClick={() => toggle("rec", s)}
                  style={{ width: `${pct}%`, background: REC_COLOR[s], opacity: sel.rec && sel.rec !== s ? 0.35 : 1 }}
                />
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
            {REC_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggle("rec", s)}
                className={cn("rounded-lg border p-2 transition-colors", sel.rec === s ? "border-primary bg-primary/10" : "border-border hover:bg-secondary")}
              >
                <span className="mx-auto mb-1 block size-2 rounded-full" style={{ background: REC_COLOR[s] }} />
                <b className="block text-base tabular-nums">{formatNumber(recCounts[s])}</b>
                <span className="text-muted-foreground">{s}</span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {doneTotal > 0 ? (
              <>
                Tỷ lệ nghiệm thu / tour đã Done:{" "}
                <b className={recCounts["Chưa nghiệm thu"] > 0 ? "text-[var(--brand-accent)]" : undefined}>{formatNumber(Math.round((recCounts["Đã nghiệm thu"] / doneTotal) * 100))}%</b> ({formatNumber(recCounts["Đã nghiệm thu"])}/{formatNumber(doneTotal)} tour)
              </>
            ) : (
              "Chưa có tour nào Done trong khoảng đang lọc."
            )}
          </p>
        </Panel>
      </div>

      {/* Hàng 2: Cơ cấu số tour — 3 chart riêng theo 3 trường khác nhau (không gộp vì không cùng phân cấp) */}
      <div className="grid gap-4 xl:grid-cols-3">
        {(Object.keys(DIM_CFG) as DimMetric[]).map((k) => {
          const data = dimDataByKey[k];
          const tot2 = dimTotByKey[k];
          return (
            <Panel key={k} title={`Số tour dự kiến theo ${DIM_CFG[k].label}`} code={`CH-TOUR-O3-${k}`} isEmpty={data.every((d) => d.n === 0)}>
              <ResponsiveContainer width="100%" height={Math.max(180, data.length * 32 + 24)}>
                <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                  <XAxis type="number" {...axisProps} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" {...axisProps} width={110} tick={YCategoryTick} />
                  <Tooltip
                    cursor={{ fill: "var(--secondary)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const g = payload[0]?.payload as Grp;
                      return <GroupTooltip g={g} tot={tot2} label={g.name} />;
                    }}
                  />
                  <Bar dataKey="n" radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: { name?: string }) => { toggle("dimVal", d?.name); setSel((s) => ({ ...s, dimKey: k })); }}>
                    {data.map((r) => (
                      <Cell key={r.name} fill={OC.tour} fillOpacity={sel.dimKey === k && sel.dimVal && sel.dimVal !== r.name ? 0.3 : 1} />
                    ))}
                    <LabelList dataKey="n" position="right" formatter={(v: number) => empty(v)} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          );
        })}
      </div>

      {/* Hàng 3: HS dự kiến vs thực tế + Heatmap Tháng × Thứ */}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="HS dự kiến và HS thực tế theo thời gian" subtitle="Tháng chưa có SL TT chỉ hiện cột dự kiến." code="CH-TOUR-O4" isEmpty={planAct.every((r) => r.plan === null)}>
          <ResponsiveContainer width="100%" height={CHART_H}>
            <BarChart data={planAct} margin={{ top: 16, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v: number) => formatNumber(v)} width={40} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0]?.payload as (typeof planAct)[number];
                  const planSum = planAct.reduce((a, x) => a + (x.plan ?? 0), 0);
                  return (
                    <TooltipBox label={monthLabel(r.m)}>
                      <TooltipRow color={OC.hs} name="HS dự kiến" value={r.plan ?? 0} unit="HS" share={planSum ? ((r.plan ?? 0) / planSum) * 100 : undefined} />
                      {r.k ? (
                        <TooltipRow color={OC.tour} name="HS thực tế (SL TT)" value={r.act ?? 0} unit="HS" share={r.plan ? ((r.act ?? 0) / r.plan) * 100 : undefined} />
                      ) : (
                        <p className="text-muted-foreground">Chưa có SL TT</p>
                      )}
                      <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">
                        Tổng dự kiến các tháng: {formatNumber(planSum)} HS{r.k ? `, ${r.k}/${r.n} tour có SL TT` : ""}
                      </p>
                    </TooltipBox>
                  );
                }}
              />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="plan" name="HS dự kiến" fill={OC.hs} radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: { m?: string }) => toggle("month", d?.m)}>
                <LabelList dataKey="plan" position="top" formatter={(v: number | null) => (v === null ? "" : formatNumber(v))} style={{ fontSize: 9, fill: CHART_COLORS.axis }} />
              </Bar>
              <Bar dataKey="act" name="HS thực tế (SL TT)" fill={OC.tour} radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: { m?: string }) => toggle("month", d?.m)}>
                <LabelList dataKey="act" position="top" formatter={(v: number | null) => (v === null ? "" : formatNumber(v))} style={{ fontSize: 9, fill: CHART_COLORS.axis }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Số tour theo Tháng × Thứ" subtitle="Bấm ô, tên tháng hoặc tên thứ để lọc chéo." code="CH-TOUR-O5" isEmpty={heat.ms.length === 0}>
          <div className="overflow-auto" style={{ maxHeight: CHART_H + 12 }}>
            <table className="w-full border-separate border-spacing-[3px] text-xs">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 bg-card py-1 text-left font-semibold text-muted-foreground">Tháng</th>
                  {WEEKDAYS.map((w, i) => (
                    <th key={w} className="sticky top-0 z-10 bg-card py-1">
                      <button type="button" onClick={() => toggle("weekday", i)} className={cn("font-semibold text-muted-foreground hover:text-foreground", sel.weekday === i && "text-primary")}>
                        {w}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heat.ms.map((m) => (
                  <tr key={m}>
                    <th className="whitespace-nowrap text-left">
                      <button type="button" onClick={() => toggle("month", m)} className={cn("font-semibold hover:text-primary", sel.month === m && "text-primary")}>
                        {monthShort(m, refYear)}
                      </button>
                    </th>
                    {(heat.cnt.get(m) as number[]).map((v, i) => {
                      const on = sel.month === m && sel.weekday === i;
                      return (
                        <td key={i} className="p-0">
                          <button
                            type="button"
                            title={`${monthLabel(m)} · ${WEEKDAYS[i]}: ${v} tour`}
                            onClick={() => {
                              setSel((s) => (s.month === m && s.weekday === i ? { ...s, month: undefined, weekday: undefined } : { ...s, month: m, weekday: i }));
                            }}
                            className={cn("h-8 w-full text-center text-[11px] font-semibold tabular-nums", on && "ring-2 ring-foreground")}
                            style={{
                              background: v ? mix(CHART_COLORS.primary, 15 + Math.round((v / heat.max) * 85)) : "transparent",
                              color: v / heat.max >= 0.6 ? "#fff" : undefined,
                              opacity: (sel.month && sel.month !== m) || (sel.weekday !== undefined && sel.weekday !== i) ? 0.45 : 1,
                            }}
                          >
                            {v || ""}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Hàng 4: Danh sách cần xử lý — tour Done nhưng chưa có biên bản nghiệm thu */}
      <Panel
        title="Tour đã Done nhưng chưa nghiệm thu — cần đối chiếu"
        subtitle="Sắp theo số ngày trễ nhiều nhất trước — đây là danh sách việc cần làm cho vận hành/kế toán."
        code="CH-TOUR-O6"
        isEmpty={backlog.length === 0}
      >
        {backlog.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có tour nào tồn đọng — mọi tour Done trong khoảng đang lọc đều đã có biên bản nghiệm thu khớp.</p>
        ) : (
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr>
                  {["Ngày tour", "Số ngày trễ", "Tên trường", "Sale phụ trách", "Số học sinh", "Doanh thu dự kiến"].map((h, i) => (
                    <th key={h} className={cn("whitespace-nowrap border-b border-border px-2 py-2 font-medium", i >= 4 ? "text-right" : "text-left")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {backlog.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="whitespace-nowrap px-2 py-1.5">{dm(r.date as string)}/{(r.date as string).slice(0, 4)}</td>
                    <td className="px-2 py-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 font-medium", r.daysAgo > 14 ? "bg-destructive/15 text-destructive" : "bg-[var(--brand-accent)]/15 text-[var(--brand-accent)]")}>
                        {r.daysAgo} ngày
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-medium">{r.schoolName}</td>
                    <td className="px-2 py-1.5">{r.sale ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.students)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fTr(r.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ================================================================== */
/* TAB 2 — Lịch tour (heatmap tháng → tuần  ⇄  timeline trong tuần)    */
/* ================================================================== */

const EMPTY_DAY: DayInfo = { items: [], load: 0, tours: 0, hasOther: false, peak: 0 };
const HOUR_H = 44;
const heatPct = (v: number) => (v <= 0 ? 0 : v <= 100 ? 18 : v <= 200 ? 40 : v <= 300 ? 70 : 100);
type HeatMetric = "dt" | "tour" | "hs";
const HEAT_METRICS: { key: HeatMetric; label: string }[] = [
  { key: "dt", label: "Doanh thu" },
  { key: "tour", label: "Số tour" },
  { key: "hs", label: "Số học sinh" },
];
const dayMetricValue = (inf: DayInfo, metric: HeatMetric): number =>
  metric === "hs" ? inf.load : metric === "tour" ? inf.tours : inf.items.filter((r) => r.kind === "tour").reduce((a, r) => a + r.revenue, 0);
const fmtMetric = (v: number, metric: HeatMetric): string => (metric === "dt" ? (v ? fTr(v) : "") : v ? formatNumber(v) : "");

function TourSchedule({ items, today, active }: { items: TourItem[]; today: string; active: boolean }) {
  const curMonth = today.slice(0, 7);
  /** "Đã đi" = ngày tour < hôm nay; "Chưa đi" = từ hôm nay trở đi hoặc chưa có ngày cụ thể. */
  const [statuses, setStatuses] = useState<Set<"Đã đi" | "Chưa đi">>(() => new Set());
  const passStatus = useCallback(
    (r: TourItem) => statuses.size === 0 || statuses.has(r.hasDate && r.date && r.date < today ? "Đã đi" : "Chưa đi"),
    [statuses, today],
  );
  const dated = useMemo(() => items.filter((r) => r.hasDate && r.date && passStatus(r)), [items, passStatus]);
  const undated = useMemo(() => items.filter((r) => !r.hasDate && passStatus(r)).sort((a, b) => a.month.localeCompare(b.month)), [items, passStatus]);
  /** Toàn bộ khoảng ngày có dữ liệu — mặc định hiển thị đầy đủ các tháng (cuộn dọc trong khung heatmap). */
  const fullRange = useMemo<DateRange>(() => {
    const ds = items.filter((r) => r.date).map((r) => r.date as string).sort();
    return ds.length ? { from: ds[0] as string, to: ds[ds.length - 1] as string } : quickRange("fyThis", today);
  }, [items, today]);
  const [range, setRange] = useState<DateRange>(fullRange);
  /** Phạm vi số liệu cho card + chart Số lượt tour theo sale: mặc định toàn bộ thời gian; bấm tháng -> tháng đó; bấm tuần/ngày -> tuần đó. */
  const [mScope, setMScope] = useState<"all" | "month" | "week">("all");
  const [mMonth, setMMonth] = useState<string>(curMonth);
  const heatMonths = useMemo(() => {
    const all = Array.from(new Set([...dated.map((r) => r.month), curMonth])).sort();
    const windowed = all.filter((m) => m >= range.from.slice(0, 7) && m <= range.to.slice(0, 7));
    return windowed.length ? windowed : all;
  }, [dated, curMonth, range]);

  const [week, setWeek] = useState(mondayOf(today));
  const [focusDay, setFocusDay] = useState<string | null>(today);
  const [open, setOpen] = useState<Set<string>>(() => new Set([curMonth]));
  const [kinds] = useState<Set<TourKind>>(() => new Set<TourKind>(["tour", "guest", "block"]));
  const [selId, setSelId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(true);
  const [scope, setScope] = useState<"week" | "month" | "all">("all");
  const [hmMetric, setHmMetric] = useState<HeatMetric>("hs");
  const [q, setQ] = useState("");
  const [onlyTT, setOnlyTT] = useState(false);

  const hmScroll = useRef<HTMLDivElement>(null);
  const hmCard = useRef<HTMLDivElement>(null);
  const tlCard = useRef<HTMLDivElement>(null);

  /** Tải theo ngày tính sẵn một lần cho mọi ngày có dữ liệu; ngày trống dùng EMPTY_DAY. */
  const infoByDay = useMemo(() => {
    const m = new Map<string, DayInfo>();
    new Set(dated.map((r) => r.date as string)).forEach((d) => m.set(d, dayInfo(dated, d)));
    return m;
  }, [dated]);
  const infoCache = useCallback((d: string): DayInfo => infoByDay.get(d) ?? EMPTY_DAY, [infoByDay]);
  const dayMetricMax = useMemo(() => {
    let max = 1;
    infoByDay.forEach((inf) => {
      max = Math.max(max, dayMetricValue(inf, hmMetric));
    });
    return max;
  }, [infoByDay, hmMetric]);
  const metricPct = useCallback(
    (v: number) => (hmMetric === "hs" ? heatPct(v) : v <= 0 ? 0 : Math.min(100, Math.round((v / dayMetricMax) * 100))),
    [hmMetric, dayMetricMax],
  );

  const selectWeek = useCallback((w: string, d: string | null) => {
    setMScope("week");
    setWeek(w);
    setFocusDay(d);
    setOpen((s) => new Set([...s, w.slice(0, 7), addDays(w, 6).slice(0, 7)]));
  }, []);

  /* Giữ heatmap cao bằng timeline, và tự cuộn tới tuần đang chọn (không bắt người dùng tự tìm). */
  useLayoutEffect(() => {
    if (!active) return;
    const sc = hmScroll.current;
    const tl = tlCard.current;
    const hm = hmCard.current;
    if (!sc || !tl || !hm) return;
    const wide = window.matchMedia("(min-width: 1280px)").matches;
    const other = hm.offsetHeight - sc.offsetHeight;
    sc.style.maxHeight = wide ? `${Math.max(320, tl.offsetHeight - other)}px` : "420px";
    const row = sc.querySelector<HTMLElement>(`tr[data-w="${week}"]`);
    if (row) {
      const head = sc.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const top = row.offsetTop - head - 4;
      const bottom = row.offsetTop + row.offsetHeight;
      if (top < sc.scrollTop || bottom > sc.scrollTop + sc.clientHeight) sc.scrollTop = Math.max(0, top - sc.clientHeight / 3);
    }
  }, [active, week, open, selId, kinds]);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week]);
  const weekInfos = useMemo(() => weekDays.map((d) => infoCache(d)), [weekDays, infoCache]);

  const wk = useMemo(() => {
    const tours = weekInfos.reduce((a, d) => a + d.tours, 0);
    const hs = weekInfos.reduce((a, d) => a + d.load, 0);
    let pk = -1;
    let pi = 0;
    weekInfos.forEach((d, i) => {
      if (d.load > pk) {
        pk = d.load;
        pi = i;
      }
    });
    const list = dated.filter((r) => r.kind === "tour" && (r.date as string) >= week && (r.date as string) <= addDays(week, 6));
    return {
      tours,
      hs,
      peak: pk,
      peakDay: weekDays[pi] as string,
      noStatus: list.filter((r) => r.status === "Chưa xác định").length,
      bySale: Object.entries(
        list.reduce<Record<string, { hs: number; n: number }>>((a, r) => {
          const k = r.sale ?? "(Chưa có sale)";
          a[k] = a[k] ?? { hs: 0, n: 0 };
          (a[k] as { hs: number; n: number }).hs += r.students;
          (a[k] as { hs: number; n: number }).n += 1;
          return a;
        }, {}),
      ).sort((a, b) => b[1].hs - a[1].hs),
    };
  }, [weekInfos, weekDays, dated, week]);

  const undatedInRange = useMemo(() => undated.filter((r) => r.month >= range.from.slice(0, 7) && r.month <= range.to.slice(0, 7)), [undated, range]);
  const mList = useMemo(() => {
    let l = dated.filter((r) => r.kind === "tour" && (r.date as string) >= range.from && (r.date as string) <= range.to);
    if (mScope === "month") l = l.filter((r) => r.month === mMonth);
    if (mScope === "week") l = l.filter((r) => (r.date as string) >= week && (r.date as string) <= addDays(week, 6));
    return l;
  }, [dated, range, mScope, mMonth, week]);
  const mTot = useMemo(() => totalOf(mList), [mList]);
  const mAct = useMemo(() => {
    const w = mList.filter((r) => r.actualStudents !== null);
    return { n: w.length, act: w.reduce((a, r) => a + (r.actualStudents ?? 0), 0), plan: w.reduce((a, r) => a + r.students, 0) };
  }, [mList]);
  const mSales = useMemo(() => Array.from(new Set(mList.filter((r) => r.sale).map((r) => r.sale as string))).sort(), [mList]);
  const bySale = useMemo(() => groupTours(mList, (r) => r.sale ?? SALE_NONE).sort((a, b) => b.n - a.n), [mList]);
  const bySaleTop = useMemo(() => {
    const top = bySale.slice(0, 7);
    const rest = bySale.slice(7);
    if (!rest.length) return top;
    const restRow: Grp & { members?: Grp[] } = {
      name: "Các sales còn lại",
      n: rest.reduce((a, g) => a + g.n, 0),
      hs: rest.reduce((a, g) => a + g.hs, 0),
      dt: rest.reduce((a, g) => a + g.dt, 0),
      members: rest,
    };
    return [...top, restRow];
  }, [bySale]);
  const scopeLabel = mScope === "all" ? "toàn bộ thời gian" : mScope === "month" ? monthLabel(mMonth) : `tuần ${dm(week)} – ${dm(addDays(week, 6))}`;

  const sel = selId === null ? null : (items.find((r) => r.id === selId) ?? null);

  const tableRows = useMemo(() => {
    const we = addDays(week, 6);
    const refMonth = (focusDay ?? week).slice(0, 7);
    let l = items.slice();
    if (scope === "week") l = l.filter((r) => r.date && r.date >= week && r.date <= we);
    if (scope === "month") l = l.filter((r) => r.date && r.date.slice(0, 7) === refMonth);
    l = l.filter((r) => kinds.has(r.kind));
    if (onlyTT) l = l.filter((r) => r.actualStudents !== null);
    if (q) {
      const s = q.toLowerCase();
      l = l.filter((r) => `${r.schoolName} ${r.sale ?? ""}`.toLowerCase().includes(s));
    }
    return l.sort((a, b) => (a.date ?? `${a.month}-99`).localeCompare(b.date ?? `${b.month}-99`) || (a.start ?? 0) - (b.start ?? 0));
  }, [items, week, focusDay, scope, kinds, onlyTT, q]);

  const scopeText = scope === "week" ? `tuần ${dm(week)} – ${dm(addDays(week, 6))}` : scope === "month" ? monthLabel((focusDay ?? week).slice(0, 7)) : "toàn bộ lịch";

  const [a0, a1] = TOUR_RULES.axis;
  const span = a1 - a0;

  return (
    <div className="space-y-4">
      <TourRangeFilter
        range={range}
        setRange={setRange}
        today={today}
        resetTo={fullRange}
        onReset={() => {
          setMScope("all");
          setStatuses(new Set());
        }}
        extra={
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tiến độ</span>
            <div className="flex flex-wrap gap-1">
              {(["Đã đi", "Chưa đi"] as const).map((s) => {
                const on = statuses.has(s);
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      setStatuses((cur) => {
                        const n = new Set(cur);
                        if (n.has(s)) n.delete(s);
                        else n.add(s);
                        return n;
                      })
                    }
                    className={cn(
                      "rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-input text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Doanh thu dự kiến" value={mTot.n ? formatNumber(mTot.dt / 1_000_000, mTot.dt < 100_000_000 ? 1 : 0) : "—"} unit="tr" change={null} />
        <KpiCard label={mScope === "week" ? "Số tour trong tuần" : mScope === "month" ? "Số tour trong tháng" : "Số tour"} value={formatNumber(mTot.n)} unit="tour" change={null} />
        <KpiCard label="Số học sinh dự kiến" value={formatNumber(mTot.hs)} unit="HS" change={null} />
        <KpiCard
          label="Số học sinh thực tế"
          value={mAct.n ? formatNumber(mAct.act) : "—"}
          unit={mAct.n ? "HS" : undefined}
          change={null}
          subtitle={mAct.n && mAct.plan ? `Đạt ${formatNumber(Math.round((mAct.act / mAct.plan) * 100))}% so với dự kiến` : "Chưa có SL TT"}
        />
        <KpiCard label="Số Sale phụ trách" value={formatNumber(mSales.length)} unit="sale" change={null} />
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Số liệu các card và chart Số lượt tour theo sale đang theo: <b>{scopeLabel}</b>.{" "}
        {mScope !== "all" && (
          <button type="button" className="underline" onClick={() => setMScope("all")}>
            Xem toàn bộ thời gian
          </button>
        )}
      </p>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(360px,5fr)_minmax(0,8fr)]">
        {/* ---------------- Heatmap tháng → tuần ---------------- */}
        <section ref={hmCard} className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <h2 className="text-sm font-semibold">Lịch tour theo Tháng</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Bấm tên tháng để mở các tuần. Bấm một ngày hoặc một tuần để xem lịch bên cạnh.</p>
          <div className="my-2 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
              {HEAT_METRICS.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setHmMetric(m.key)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    hmMetric === m.key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              {[18, 40, 70, 100].map((p) => (
                <span key={p} className="inline-flex items-center gap-1">
                  <i className="inline-block size-3 rounded-sm" style={{ background: mix(CHART_COLORS.primary, p) }} />
                  {p === 18 ? "Thấp" : p === 100 ? "Cao" : ""}
                </span>
              ))}
            </div>
          </div>
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <i className="size-2 rounded-full bg-[#2e9e5b]" /> Còn chỗ cả 2 buổi
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="size-2 rounded-full" style={{ background: WARN }} /> 1 buổi đã Full
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="size-2 rounded-full bg-destructive" /> Cả 2 buổi Full
            </span>
          </div>
          <div ref={hmScroll} className="relative overflow-auto border-t border-border">
            <table className="w-full min-w-[340px] border-separate border-spacing-[3px] text-xs">
              <thead>
                <tr>
                  <th className="sticky top-0 z-10 w-24 bg-card py-1.5 text-left font-semibold text-muted-foreground">Tuần</th>
                  {WEEKDAYS.map((w) => (
                    <th key={w} className="sticky top-0 z-10 bg-card py-1.5 font-semibold text-muted-foreground">
                      {w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatMonths.map((m) => {
                  const isOpen = open.has(m);
                  const byHs = [0, 0, 0, 0, 0, 0, 0];
                  const byTour = [0, 0, 0, 0, 0, 0, 0];
                  const byDt = [0, 0, 0, 0, 0, 0, 0];
                  dated.filter((r) => r.month === m && r.kind === "tour").forEach((r) => {
                    const i = weekdayIdx(r.date as string);
                    byHs[i] = (byHs[i] ?? 0) + r.students;
                    byTour[i] = (byTour[i] ?? 0) + 1;
                    byDt[i] = (byDt[i] ?? 0) + r.revenue;
                  });
                  const byMetric = hmMetric === "hs" ? byHs : hmMetric === "tour" ? byTour : byDt;
                  const monthMax = Math.max(1, ...byMetric);
                  const tours = byTour.reduce((a, b) => a + b, 0);
                  const hs = byHs.reduce((a, b) => a + b, 0);
                  const dtSum = byDt.reduce((a, b) => a + b, 0);
                  const toggleMonth = () => {
                    setMScope("month");
                    setMMonth(m);
                    setOpen((s) => {
                      const n = new Set(s);
                      if (n.has(m)) n.delete(m);
                      else {
                        n.add(m);
                        if (week.slice(0, 7) !== m && addDays(week, 6).slice(0, 7) !== m) {
                          const ws = weeksOfMonth(m);
                          const w = ws.find((x) => dated.some((r) => (r.date as string) >= x && (r.date as string) <= addDays(x, 6))) ?? (ws[0] as string);
                          setWeek(w);
                          setFocusDay(null);
                        }
                      }
                      return n;
                    });
                  };
                  return (
                    <Fragment key={m}>
                      <tr className="cursor-pointer" onClick={toggleMonth} aria-expanded={isOpen}>
                        <th className="whitespace-nowrap px-1 py-1.5 text-left font-semibold">
                          <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); toggleMonth(); }}>
                            <span className="inline-block w-3 text-muted-foreground">{isOpen ? "▾" : "▸"}</span> {monthLabel(m)}
                            <span className="block pl-3 text-[11px] font-normal text-muted-foreground">
                              {formatNumber(tours)} tour, {formatNumber(hs)} HS, {fTr(dtSum)}
                            </span>
                          </button>
                        </th>
                        {byMetric.map((v, i) => (
                          <td
                            key={i}
                            className="py-1.5 text-center text-[11px]"
                            style={{ background: v ? mix(CHART_COLORS.primary, 15 + Math.round((v / monthMax) * 85)) : "var(--secondary)", color: v / monthMax >= 0.6 ? "#fff" : undefined }}
                            title={`${WEEKDAYS[i]} trong ${monthLabel(m)}: ${byTour[i]} tour, ${formatNumber(byHs[i] ?? 0)} HS, ${fTr(byDt[i] ?? 0)}`}
                          >
                            <b className="block text-xs">{fmtMetric(v, hmMetric) || "–"}</b>
                          </td>
                        ))}
                      </tr>
                      {isOpen &&
                        weeksOfMonth(m).map((w) => {
                          const isSel = w === week;
                          return (
                            <tr key={`${m}-${w}`} data-w={w}>
                              <th
                                className={cn(
                                  "cursor-pointer whitespace-nowrap rounded px-1 text-left text-xs font-normal text-muted-foreground",
                                  isSel && "bg-primary/10 font-semibold text-secondary-foreground",
                                )}
                                onClick={() => selectWeek(w, null)}
                              >
                                <button type="button">{dm(w)}–{dm(addDays(w, 6))}</button>
                              </th>
                              {Array.from({ length: 7 }, (_, i) => {
                                const d = addDays(w, i);
                                const inf = infoCache(d);
                                const v = dayMetricValue(inf, hmMetric);
                                const pct = metricPct(v);
                                const out = d.slice(0, 7) !== m;
                                const isFocus = isSel && d === focusDay;
                                const cap = TOUR_RULES.capacityWarn;
                                const { sang, chieu } = buoiLoad(dated, d);
                                const hasTour = sang > 0 || chieu > 0;
                                const fullCount = (sang >= cap ? 1 : 0) + (chieu >= cap ? 1 : 0);
                                const dotColor = !hasTour ? null : fullCount === 2 ? "var(--destructive)" : fullCount === 1 ? WARN : "#2e9e5b";
                                const statusText = !hasTour
                                  ? "Chưa có tour"
                                  : `Sáng: ${formatNumber(sang)}/${cap} ${sang >= cap ? "(Full)" : `(còn ${formatNumber(cap - sang)} HS)`} · Chiều: ${formatNumber(chieu)}/${cap} ${chieu >= cap ? "(Full)" : `(còn ${formatNumber(cap - chieu)} HS)`}`;
                                return (
                                  <td
                                    key={d}
                                    className={cn(
                                      "relative h-11 cursor-pointer rounded-none border p-0 text-center align-middle",
                                      isSel ? "border-primary" : "border-border",
                                      out && "opacity-40",
                                    )}
                                    style={{
                                      background: pct ? mix(CHART_COLORS.primary, pct) : "transparent",
                                      color: pct >= 70 ? "#fff" : undefined,
                                      boxShadow: isFocus ? "inset 0 0 0 2px var(--foreground)" : undefined,
                                    }}
                                    title={`${WEEKDAYS[i]} ${dm(d)} — ${statusText}`}
                                    onClick={() => selectWeek(w, d)}
                                  >
                                    <span
                                      className={cn("absolute left-1 top-0.5 text-[10px]", d === today && "rounded px-1 text-white")}
                                      style={d === today ? { background: WARN } : { opacity: 0.8 }}
                                    >
                                      {Number(d.slice(8))}
                                    </span>
                                    {dotColor && <span className="absolute right-1 top-1 size-2 rounded-full" style={{ background: dotColor }} />}
                                    <span className="text-[13px] font-semibold tabular-nums">{fmtMetric(v, hmMetric)}</span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------------- Timeline 7 ngày của tuần đang chọn ---------------- */}
        <section ref={tlCard} className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">
                Lịch tuần {dm(week)} – {dm(addDays(week, 6))}/{addDays(week, 6).slice(0, 4)}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatNumber(wk.tours)} tour, {formatNumber(wk.hs)} HS. Cạnh phải nét đứt: giờ kết thúc tự suy ra theo rule.
              </p>
            </div>
            <div className="flex gap-1.5">
              <button type="button" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-secondary" onClick={() => selectWeek(addDays(week, -7), null)}>
                <ChevronLeft className="size-3.5" /> Tuần trước
              </button>
              <button type="button" className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-secondary" onClick={() => selectWeek(mondayOf(today), today)}>
                Tuần này
              </button>
              <button type="button" className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-secondary" onClick={() => selectWeek(addDays(week, 7), null)}>
                Tuần sau <ChevronRight className="size-3.5" />
              </button>
              <button
                type="button"
                className={cn("rounded-md border px-2.5 py-1 text-xs hover:bg-secondary", detailOpen ? "border-[var(--brand-accent)] text-[var(--brand-accent)]" : "border-border")}
                onClick={() => setDetailOpen((v) => !v)}
              >
                Chi tiết tour {detailOpen ? "▸ ẩn" : "▸ hiện"}
              </button>
            </div>
          </div>

          {focusDay && (
            <div className="mb-3 rounded-lg border border-border bg-secondary/30 p-3">
              <p className="mb-2 text-xs font-semibold">
                Slot trống {WEEKDAYS[weekdayIdx(focusDay)]} {dm(focusDay)}
              </p>
              {(() => {
                const cap = TOUR_RULES.capacityWarn;
                const slots = daySlots(dated, focusDay);
                const dayStart = TOUR_RULES.fullDay[0];
                const dayEnd = TOUR_RULES.fullDay[1];
                const rows: { start: number; end: number; load: number }[] = [];
                let cursor: number = dayStart;
                for (const s of slots) {
                  if (s.start > cursor) rows.push({ start: cursor, end: s.start, load: 0 });
                  rows.push({ start: s.start, end: s.end, load: s.load });
                  cursor = s.end;
                }
                if (cursor < dayEnd) rows.push({ start: cursor, end: dayEnd, load: 0 });
                return (
                  <div className="grid gap-1.5">
                    {rows.map((r, i) => {
                      const pct = Math.min(100, Math.round((r.load / cap) * 100));
                      const full = r.load >= cap;
                      return (
                        <div key={i} className="grid grid-cols-[92px_1fr_auto] items-center gap-2 text-xs">
                          <span className="tabular-nums text-muted-foreground">
                            {hhmm(r.start)}–{hhmm(r.end)}
                          </span>
                          <div className="h-3 overflow-hidden bg-secondary">
                            <div className="h-full" style={{ width: `${pct}%`, background: full ? "var(--destructive)" : r.load > 0 ? WARN : "transparent" }} />
                          </div>
                          <span className={cn("whitespace-nowrap font-medium", full && "text-destructive")}>
                            {r.load === 0 ? `Trống · còn ${formatNumber(cap)} HS` : full ? `${formatNumber(r.load)}/${cap} · FULL` : `${formatNumber(r.load)}/${cap} · còn ${formatNumber(cap - r.load)} HS`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          <div className={cn("grid gap-3", detailOpen ? "lg:grid-cols-[minmax(0,1fr)_200px]" : "grid-cols-1")}>
            <div className="min-w-0">
              {/* Cột = thứ, hàng = giờ */}
              <div className="grid grid-cols-[40px_repeat(7,minmax(0,1fr))] text-[11px]">
                <span />
                {weekDays.map((d, i) => {
                  const inf = weekInfos[i] as DayInfo;
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setFocusDay(d)}
                      className={cn("border-l border-border px-1 pb-1 text-left leading-tight", d === focusDay && "bg-primary/5")}
                    >
                      <b className="text-[12px]">
                        {WEEKDAYS[i]} {dm(d)}
                      </b>
                      {d === today && (
                        <span className="ml-1 inline-block rounded-full border px-1 text-[9px]" style={{ borderColor: WARN, color: WARN }}>
                          Nay
                        </span>
                      )}
                      <span className="block text-muted-foreground">{inf.load ? `${formatNumber(inf.load)} HS, ${inf.tours} tour` : "Trống"}</span>
                    </button>
                  );
                })}
              </div>
              <div className="relative grid grid-cols-[40px_repeat(7,minmax(0,1fr))] border-t border-border">
                {a0 < 12 && a1 > 12 && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed"
                    style={{ top: (12 - a0) * HOUR_H, left: 40, right: 0, borderColor: "var(--brand-accent)" }}
                    title="12:00 — ranh giới Sáng/Chiều"
                  />
                )}
                <div className="relative text-[11px] text-muted-foreground" style={{ height: HOUR_H * span }}>
                  {Array.from({ length: span + 1 }, (_, i) => (
                    <span key={i} className={cn("absolute right-1 -translate-y-1/2", a0 + i === 12 && "font-bold text-[var(--brand-accent)]")} style={{ top: i * HOUR_H }}>
                      {a0 + i}h
                    </span>
                  ))}
                </div>
                {weekDays.map((d, i) => {
                  const inf = weekInfos[i] as DayInfo;
                  const bars = inf.items
                    .filter((r) => kinds.has(r.kind) && r.start !== null && r.end !== null)
                    .sort((x, y) => (x.start as number) - (y.start as number) || (y.end as number) - (x.end as number));
                  const ends: number[] = [];
                  const lane = new Map<number, number>();
                  bars.forEach((r) => {
                    let l = ends.findIndex((e) => e <= (r.start as number) + 1e-6);
                    if (l < 0) {
                      l = ends.length;
                      ends.push(0);
                    }
                    ends[l] = r.end as number;
                    lane.set(r.id, l);
                  });
                  const lanes = Math.max(1, ends.length);
                  return (
                    <div
                      key={d}
                      className={cn("relative border-l border-border", d === focusDay && "bg-primary/5")}
                      style={{
                        height: HOUR_H * span,
                        backgroundImage: "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                        backgroundSize: `100% ${HOUR_H}px`,
                      }}
                    >
                      {bars.map((r) => {
                        const st = Math.max(r.start as number, a0);
                        const en = Math.min(r.end as number, a1);
                        const l = lane.get(r.id) ?? 0;
                        return (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => setSelId((cur) => (cur === r.id ? null : r.id))}
                            title={`${r.schoolName}\n${hhmm(r.start as number)}–${hhmm(r.end as number)}${r.endAssumed ? " (kết thúc theo rule)" : ""}\n${formatNumber(r.students)} HS${r.sale ? `, sale ${r.sale}` : ""}${r.grade ? `, ${r.grade}` : ""}\n${r.status}`}
                            className={cn(
                              "absolute overflow-hidden rounded px-1 py-0.5 text-left text-[10px] leading-tight",
                              BAR_CLS[r.kind],
                              selId === r.id && "ring-2 ring-foreground",
                            )}
                            style={{
                              top: (st - a0) * HOUR_H + 1,
                              height: Math.max(18, (en - st) * HOUR_H - 2),
                              left: `calc(${(l / lanes) * 100}% + 1px)`,
                              width: `calc(${100 / lanes}% - 2px)`,
                              borderBottomStyle: r.endAssumed ? "dashed" : undefined,
                            }}
                          >
                            <b className="block truncate">{r.schoolName}</b>
                            <span className="block">
                              {hhmm(r.start as number)}–{hhmm(r.end as number)} · {formatNumber(r.students)} HS
                            </span>
                            {r.sale && <span className="block truncate opacity-90">Sale: {r.sale}</span>}
                            <span className="block truncate opacity-90">{r.status}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>

            {detailOpen && (
              <aside
                className="min-w-0 self-start break-words rounded-lg border border-[var(--brand-accent)]/40 p-3 text-sm"
                style={{ background: "color-mix(in oklab, var(--brand-accent) 12%, transparent)" }}
              >
                {!sel ? <p className="text-xs text-muted-foreground">Bấm vào một tour trên lịch để xem đầy đủ thông tin.</p> : <TourDetail r={sel} />}
              </aside>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Số lượt tour theo sale" subtitle={`Số liệu theo ${scopeLabel}. Bấm tháng hoặc tuần ở lịch bên trên để xem số của tháng/tuần đó.`} isEmpty={bySaleTop.length === 0}>
          <ResponsiveContainer width="100%" height={Math.max(220, bySaleTop.length * 34 + 40)}>
            <BarChart data={bySaleTop} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} allowDecimals={false} />
              <YAxis type="category" dataKey="name" {...axisProps} width={100} tick={YCategoryTick} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const g = payload[0]?.payload as Grp & { members?: Grp[] };
                  return (
                    <TooltipBox label={g.name}>
                      <TooltipRow color={OC.tour} name="Số lượt tour" value={g.n} unit="tour" share={mTot.n ? (g.n / mTot.n) * 100 : undefined} />
                      <TooltipRow color={OC.hs} name="Số học sinh" value={g.hs} unit="HS" share={mTot.hs ? (g.hs / mTot.hs) * 100 : undefined} />
                      <TooltipRow color={OC.dt} name="Doanh thu dự kiến" value={g.dt} share={mTot.dt ? (g.dt / mTot.dt) * 100 : undefined} />
                      {g.members && g.members.length > 0 && (
                        <div className="mt-1.5 border-t border-dashed border-border pt-1.5">
                          <p className="mb-1 text-muted-foreground">Chi tiết {g.members.length} sale còn lại:</p>
                          {g.members.map((m) => (
                            <p key={m.name} className="flex justify-between gap-3">
                              <span>{m.name}</span>
                              <span className="tabular-nums">
                                {formatNumber(m.n)} tour ({g.n ? formatNumber(Math.round((m.n / g.n) * 100)) : 0}%)
                              </span>
                            </p>
                          ))}
                        </div>
                      )}
                    </TooltipBox>
                  );
                }}
              />
              <Bar dataKey="n" fill={OC.tour} radius={[0, 4, 4, 0]}>
                {bySaleTop.map((g) => (
                  <Cell key={g.name} fill={g.name === "Các sales còn lại" ? CHART_COLORS.axis : OC.tour} />
                ))}
                <LabelList dataKey="n" position="right" formatter={(v: number) => formatNumber(v)} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Các tour chưa chốt ngày" subtitle="Tour đã có trong lịch nhưng chưa xác định ngày, chưa hiện được trên lịch." isEmpty={undatedInRange.length === 0}>
          <div className="max-h-72 overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr>
                  {["Tháng - Năm", "Tên trường", "Sale phụ trách", "Tiến độ", "Số học sinh"].map((h, i) => (
                    <th key={h} className={cn("whitespace-nowrap border-b border-border px-1.5 py-2 font-medium", i === 4 ? "text-right" : "text-left")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {undatedInRange.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="whitespace-nowrap px-1.5 py-1.5">
                      {r.month.slice(5, 7)} - {r.month.slice(0, 4)}
                    </td>
                    <td className="px-1.5 py-1.5 font-medium">{r.schoolName}</td>
                    <td className="px-1.5 py-1.5">{r.sale ?? ""}</td>
                    <td className="px-1.5 py-1.5">{r.status}</td>
                    <td className="px-1.5 py-1.5 text-right tabular-nums">{r.students ? formatNumber(r.students) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Chi tiết tour</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {tableRows.length} dòng, {scopeText}. Bấm một dòng để xem trên lịch.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-md border border-border" role="group" aria-label="Phạm vi bảng">
              {(
                [
                  ["week", "Tuần đang chọn"],
                  ["month", "Cả tháng"],
                  ["all", "Toàn bộ"],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={scope === k}
                  onClick={() => setScope(k)}
                  className={cn("border-r border-border px-2.5 py-1 text-xs last:border-r-0", scope === k ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary")}
                >
                  {l}
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={onlyTT} onChange={(e) => setOnlyTT(e.target.checked)} /> Chỉ tour có SL TT
            </label>
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm trường hoặc sale"
              aria-label="Tìm trường hoặc sale"
              className="h-8 rounded-md border border-input bg-card px-2.5 text-xs"
            />
          </div>
        </div>
        <div className="max-h-[480px] overflow-auto">
          <table className="w-full min-w-[1040px] text-xs">
            <thead className="sticky top-0 bg-card text-muted-foreground">
              <tr>
                {["Ngày", "Khung giờ", "Trường", "Khối", "Sale", "SL HS", "SL TT", "Chênh", "Giá vé", "DT dự kiến", "Tiến độ", "Lưu ý"].map((h, i) => (
                  <th key={h} className={cn("whitespace-nowrap border-b border-border px-1.5 py-2 font-medium", i >= 5 && i <= 9 ? "text-right" : "text-left")}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-muted-foreground">
                    {EMPTY_TEXT}
                  </td>
                </tr>
              ) : (
                tableRows.map((r) => {
                  const diff = r.actualStudents !== null ? r.actualStudents - r.students : null;
                  return (
                    <tr
                      key={r.id}
                      className={cn("border-b border-border align-top hover:bg-secondary/60", r.date && "cursor-pointer", selId === r.id && "bg-primary/10")}
                      onClick={() => {
                        if (!r.date) return;
                        setSelId(r.id);
                        selectWeek(mondayOf(r.date), r.date);
                        tlCard.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                    >
                      <td className="whitespace-nowrap px-1.5 py-1.5">
                        {r.date ? `${WEEKDAYS[weekdayIdx(r.date)]} ${toDMY(r.date)}` : <span style={{ color: WARN }}>Chưa có ngày</span>}
                      </td>
                      <td className="whitespace-nowrap px-1.5 py-1.5">{r.start !== null && r.end !== null ? `${hhmm(r.start)}–${hhmm(r.end)}${r.endAssumed ? "*" : ""}` : (r.timeRaw ?? "—")}</td>
                      <td className="px-1.5 py-1.5">
                        {r.schoolName}
                        {r.kind !== "tour" && <span className="ml-1 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">{KIND_LABEL[r.kind]}</span>}
                      </td>
                      <td className="px-1.5 py-1.5">{r.grade ?? ""}</td>
                      <td className="px-1.5 py-1.5">{r.sale ?? ""}</td>
                      <td className="px-1.5 py-1.5 text-right tabular-nums">
                        {formatNumber(r.students)}
                      </td>
                      <td className="px-1.5 py-1.5 text-right tabular-nums">{r.actualStudents !== null ? formatNumber(r.actualStudents) : ""}</td>
                      <td className={cn("px-1.5 py-1.5 text-right tabular-nums", diff !== null && diff < 0 && "text-destructive")}>
                        {diff !== null ? `${diff > 0 ? "+" : ""}${formatNumber(diff)}` : ""}
                      </td>
                      <td className="px-1.5 py-1.5 text-right tabular-nums">{r.price ? fK(r.price) : ""}</td>
                      <td className="px-1.5 py-1.5 text-right tabular-nums">{r.revenue ? formatShort(r.revenue) : ""}</td>
                      <td className="px-1.5 py-1.5">{r.status}</td>
                      <td className="min-w-52 px-1.5 py-1.5">
                        {r.flags
                          .filter((f) => !f.startsWith("Không có giờ"))
                          .map((f) => (
                            <span key={f} className="mb-0.5 mr-1 inline-block rounded-full border px-1.5 text-[10px]" style={{ borderColor: WARN, color: WARN }}>
                              {f}
                            </span>
                          ))}
                        {(r.note || r.note2) && <span className="block text-[11px] text-muted-foreground">{[r.note, r.note2].filter(Boolean).join(" | ")}</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">* Giờ kết thúc tự suy ra theo rule vì khung giờ gốc không có giờ kết thúc.</p>
      </section>

      <details className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <summary className="cursor-pointer text-sm font-semibold">Bảng đầy đủ các cột gốc (xuất CSV)</summary>
        <div className="mt-3">
          <FactTable title="Lịch tour B2B, toàn bộ cột" subtitle={`Phạm vi: ${scopeText}. Chọn cột hiển thị và xuất dữ liệu.`} columns={FULL_COLUMNS} rows={tableRows} fileName="b2b-lich-tour-chi-tiet" />
        </div>
      </details>
    </div>
  );
}

const BAR_CLS: Record<TourKind, string> = {
  tour: "border border-primary/60 border-l-[3px] border-l-primary bg-primary/15 text-foreground",
  guest: "border border-dashed border-[var(--brand-support)] bg-[color-mix(in_oklab,var(--brand-support)_25%,transparent)] text-foreground",
  block: "border border-border bg-[repeating-linear-gradient(135deg,var(--secondary)_0_6px,var(--border)_6px_8px)] text-muted-foreground",
};

function F({ k, v, hot }: { k: string; v: ReactNode; hot?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className={cn("font-semibold", hot && "inline-block rounded bg-card/80 px-1.5 py-0.5 text-[13px] text-[var(--brand-dark)] shadow-xs")}>{v}</dd>
    </div>
  );
}

function TourDetail({ r }: { r: TourItem }) {
  const diff = r.actualStudents !== null ? r.actualStudents - r.students : null;
  return (
    <div>
      <b className="mb-2 block text-base leading-snug text-[var(--brand-dark)]">{r.schoolName}</b>
      <dl className="grid grid-cols-1 gap-y-2 text-xs">
        <F
          k="Ngày, giờ"
          v={`${r.date ? `${WEEKDAYS[weekdayIdx(r.date)]} ${dm(r.date)}/${r.date.slice(0, 4)}` : "Chưa có ngày"}, ${r.start !== null && r.end !== null ? `${hhmm(r.start)}–${hhmm(r.end)}` : (r.timeRaw ?? "—")}${r.endAssumed ? " (kết thúc theo rule)" : ""}`}
        />
        <F k="Doanh thu dự kiến" v={r.revenue ? fTr(r.revenue) : "—"} hot />
        <F k="Sale" v={r.sale ?? "—"} hot />
        <F k="Tiến độ" v={r.status} hot />
        <F k="Giá vé" v={r.price ? fK(r.price) : "—"} />
        <F k="Khối lớp" v={r.grade ?? "—"} />
        <F k="SL HS dự kiến" v={formatNumber(r.students)} />
        <F k="SL TT" v={r.actualStudents !== null ? `${formatNumber(r.actualStudents)}${diff !== null ? ` (${diff > 0 ? "+" : ""}${formatNumber(diff)})` : ""}` : "—"} />
        <F k="Khu vực" v={r.region ?? "—"} />
        <F k="Nghiệm thu" v={r.bienBanId ? `Đã nghiệm thu (${r.bienBanId})` : "Chưa nghiệm thu"} />
      </dl>
      {(r.note || r.note2) && <p className="mt-2 text-xs text-muted-foreground">Ghi chú: {[r.note, r.note2].filter(Boolean).join(" | ")}</p>}
      {r.flags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.flags.map((f) => (
            <span key={f} className="inline-flex items-center gap-1 rounded-full border px-1.5 text-[10px]" style={{ borderColor: WARN, color: WARN }}>
              <AlertTriangle className="size-3" /> {f}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const FULL_COLUMNS: Column<TourItem>[] = [
  { key: "month", header: "Tháng", render: (r) => bucketLabel(r.month, "month") },
  { key: "date", header: "Ngày tham quan", render: (r) => (r.date ? toDMY(r.date) : "Chưa xác định ngày") },
  { key: "kind", header: "Loại dòng", render: (r) => KIND_LABEL[r.kind] },
  { key: "timeRaw", header: "Khung giờ", render: (r) => r.timeRaw ?? "—" },
  { key: "students", header: "SL HS", render: (r) => formatNumber(r.students), align: "right" },
  { key: "actualStudents", header: "SL TT", render: (r) => (r.actualStudents !== null ? formatNumber(r.actualStudents) : "—"), align: "right" },
  { key: "grade", header: "Khối lớp", render: (r) => r.grade ?? "—" },
  { key: "anTrua", header: "Ăn trưa", render: (r) => r.anTrua ?? "—" },
  { key: "xe", header: "Xe", render: (r) => r.xe ?? "—" },
  { key: "note", header: "Note", render: (r) => r.note ?? "—" },
  { key: "soLuongGV", header: "Số lượng GV", render: (r) => (r.soLuongGV !== null ? formatNumber(r.soLuongGV) : "—"), align: "right" },
  { key: "nguoiPhuTrach", header: "Người phụ trách", render: (r) => r.nguoiPhuTrach ?? "—" },
  { key: "thongTinLienHe", header: "Thông tin liên hệ", render: (r) => r.thongTinLienHe ?? "—" },
  { key: "schoolName", header: "Tên trường", render: (r) => r.schoolName, noTruncate: true },
  { key: "region", header: "Khu vực", render: (r) => r.region ?? "—" },
  { key: "sale", header: "Sale", render: (r) => r.sale ?? "—" },
  { key: "yeuCauYTe", header: "Yêu cầu y tế", render: (r) => r.yeuCauYTe ?? "—" },
  { key: "duocSuDungHinhAnh", header: "Được sử dụng hình ảnh", render: (r) => r.duocSuDungHinhAnh ?? "—" },
  { key: "status", header: "Tiến độ", render: (r) => r.status },
  { key: "price", header: "Giá vé (đ)", render: (r) => formatNumber(r.price), align: "right" },
  { key: "revenue", header: "Doanh thu dự kiến (đ)", render: (r) => formatNumber(r.revenue), align: "right" },
  { key: "note2", header: "Note 2", render: (r) => r.note2 ?? "—" },
  { key: "bienBanId", header: "BienBanID", render: (r) => r.bienBanId ?? "—" },
  { key: "tenKhachHang", header: "TenKhachHang", render: (r) => r.tenKhachHang ?? "—" },
  { key: "flags", header: "Lưu ý dữ liệu", render: (r) => r.flags.join("; ") },
];