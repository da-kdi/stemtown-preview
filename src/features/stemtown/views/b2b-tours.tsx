import { AlertTriangle, CalendarClock, CalendarDays, ChevronLeft, ChevronRight, LayoutGrid, Lightbulb } from "lucide-react";
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  ReferenceLine,
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
  addMonths,
  aggTours,
  baseAgg,
  commercialTours,
  dayInfo,
  delta,
  direction,
  dm,
  enrichTours,
  hhmm,
  monthAgg,
  monthLabel,
  monthRange,
  monthShort,
  mondayOf,
  quickRange,
  todayVN,
  weekdayIdx,
  weeksOfMonth,
  type CompareMode,
  type DayInfo,
  type QuickRangeKey,
  type TourAgg,
  type TourItem,
  type TourKind,
} from "@/features/stemtown/lib/tour-rules";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Màu cố định theo CHỈ SỐ (giữ nguyên ở mọi chart của trang này)       */
/* ------------------------------------------------------------------ */
const MC = {
  tour: CHART_COLORS.dark,
  size: CHART_COLORS.primary,
  price: CHART_COLORS.support,
  dt: "var(--foreground)",
} as const;
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

function StepHeader({ n, title, subtitle }: { n: number; title: string; subtitle?: string }) {
  return (
    <div className="mt-2 flex items-start gap-2.5">
      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
        {n}
      </span>
      <div>
        <h3 className="text-base font-bold tracking-tight">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function buildInsight(month: string, sale: string, cur: TourAgg, base: TourAgg & { label: string }): string {
  const ml = monthLabel(month);
  if (!cur.n) return `${ml} chưa có tour nào${sale ? ` của sale ${sale}` : ""} trong lịch.`;
  if (!base.n)
    return `${ml} có ${formatNumber(cur.n)} tour, ${formatNumber(cur.hs)} HS dự kiến, doanh thu dự kiến ${fTr(cur.dt)}. Kỳ so sánh (${base.label}) không có tour nên chưa so được.`;
  const dT = direction(delta(cur.n, base.n)) ?? "flat";
  const dS = direction(delta(cur.size, base.size)) ?? "flat";
  const dP = direction(delta(cur.price, base.price)) ?? "flat";
  const dD = direction(delta(cur.dt, base.dt)) ?? "flat";
  const W = {
    tour: { up: "nhiều tour hơn", down: "ít tour hơn", flat: "số tour tương đương" },
    size: { up: "mỗi đoàn đông hơn", down: "mỗi đoàn ít HS hơn", flat: "quy mô đoàn tương đương" },
    price: { up: "giá mỗi HS cao hơn", down: "giá mỗi HS thấp hơn", flat: "giá mỗi HS gần như không đổi" },
  };
  const p1 = `${W.tour[dT]} (${formatNumber(cur.n)} so với ${formatNumber(Math.round(base.n))})`;
  const p2 = `${W.size[dS]} (${formatNumber(Math.round(cur.size ?? 0))} so với ${formatNumber(Math.round(base.size ?? 0))} HS)`;
  const p3 = `${W.price[dP]} (${fK(cur.price ?? 0)} so với ${fK(base.price ?? 0)})`;
  const conj = dT === "flat" || dS === "flat" || dT === dS ? ", " : " nhưng ";
  const pct = delta(cur.dt, base.dt) ?? 0;
  const res =
    dD === "flat"
      ? `doanh thu dự kiến gần như đứng yên (${fTr(cur.dt)})`
      : dD === "up"
        ? `doanh thu dự kiến tăng ${Math.round(pct * 100)}% lên ${fTr(cur.dt)}`
        : `doanh thu dự kiến giảm ${Math.round(-pct * 100)}% còn ${fTr(cur.dt)}`;
  return `${ml} ${p1}${conj}${p2}, ${p3} nên ${res}. So với ${base.label}.`;
}

function TourOverview({ items, today }: { items: TourItem[]; today: string }) {
  const curMonth = today.slice(0, 7);
  const refYear = today.slice(0, 4);
  const commercial = useMemo(() => commercialTours(items, ""), [items]);
  const months = useMemo(() => {
    const ms = [...items.map((r) => r.month), curMonth].sort();
    return ms.length ? monthRange(ms[0] as string, ms[ms.length - 1] as string) : [curMonth];
  }, [items, curMonth]);
  const sales = useMemo(() => {
    const c: Record<string, number> = {};
    commercial.forEach((r) => {
      if (r.sale) c[r.sale] = (c[r.sale] ?? 0) + 1;
    });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }, [commercial]);

  const [month, setMonth] = useState(months.includes(curMonth) ? curMonth : (months[months.length - 1] as string));
  const [cmp, setCmp] = useState<CompareMode>("prev");
  const [sale, setSale] = useState("");
  /** Bộ lọc khoảng thời gian riêng cho 4 card tổng ở trên — độc lập với ô "Tháng" dùng cho phần phân tích sâu bên dưới. */
  const [quick, setQuick] = useState<QuickRangeKey>("fyThis");
  const range = useMemo(() => quickRange(quick, today), [quick, today]);
  const listAll = useMemo(
    () => commercialTours(items, sale).filter((r) => r.hasDate && r.date! >= range.from && r.date! <= range.to),
    [items, sale, range],
  );
  const aggAll = useMemo(() => aggTours(listAll), [listAll]);
  const schoolCountAll = useMemo(() => new Set(listAll.map((r) => r.schoolName)).size, [listAll]);
  /** Bộ chọn nhanh khoảng thời gian hiển thị cho các chart theo tháng (không giới hạn ô chọn Tháng). */
  const [rangeM, setRangeM] = useState<3 | 6 | 12 | 999>(6);
  const trendMonths = useMemo(() => (rangeM === 999 ? months : months.slice(-rangeM)), [months, rangeM]);

  const cur = useMemo(() => monthAgg(items, month, sale), [items, month, sale]);
  const base = useMemo(() => baseAgg(items, month, cmp, sale, refYear), [items, month, cmp, sale, refYear]);
  const list = useMemo(() => commercialTours(items, sale).filter((r) => r.month === month), [items, sale, month]);

  const trend = useMemo(
    () =>
      trendMonths.map((m) => {
        const a = monthAgg(items, m, sale);
        return { m, label: monthShort(m, refYear), tour: a.n, size: a.size, price: a.price === null ? null : a.price / 1000, dt: a.n ? a.dt / 1_000_000 : null };
      }),
    [items, trendMonths, sale, refYear],
  );

  const sizeWin = useMemo(() => {
    const ms = [6, 5, 4, 3, 2, 1, 0].map((i) => addMonths(month, -i)).filter((m) => m >= (months[0] as string));
    return ms.map((m) => {
      const l = commercialTours(items, sale).filter((r) => r.month === m);
      const row: Record<string, number | string> = { m, label: monthShort(m, refYear) };
      let lo = 0;
      TOUR_RULES.sizeBins.forEach((b) => {
        row[b.label] = l.filter((r) => r.students > lo && r.students <= b.max).length;
        lo = b.max;
      });
      return row;
    });
  }, [items, sale, month, months, refYear]);

  const saleRows = useMemo(() => {
    const div = cmp === "prev" ? 1 : 3;
    const bm = cmp === "prev" ? [addMonths(month, -1)] : [1, 2, 3].map((i) => addMonths(month, -i));
    const by = (l: TourItem[]) =>
      l.reduce<Record<string, { hs: number; n: number }>>((a, r) => {
        const k = r.sale ?? "(Chưa có sale)";
        a[k] = a[k] ?? { hs: 0, n: 0 };
        (a[k] as { hs: number; n: number }).hs += r.students;
        (a[k] as { hs: number; n: number }).n += 1;
        return a;
      }, {});
    const c = by(list);
    const b = by(commercialTours(items, sale).filter((r) => bm.includes(r.month)));
    const keys = Object.keys({ ...c, ...b })
      .sort((x, y) => (c[y]?.hs ?? 0) - (c[x]?.hs ?? 0) || (b[y]?.hs ?? 0) - (b[x]?.hs ?? 0))
      .slice(0, 6);
    return keys.map((k) => ({ name: k, cur: c[k]?.hs ?? 0, curN: c[k]?.n ?? 0, base: (b[k]?.hs ?? 0) / div, baseN: (b[k]?.n ?? 0) / div }));
  }, [list, items, sale, month, cmp]);

  const pipe = useMemo(() => {
    const ms = [1, 2, 3].map((i) => addMonths(curMonth, i));
    const done = [1, 2, 3].map((i) => addMonths(curMonth, -i));
    const avg = done.map((m) => monthAgg(items, m, sale).hs).reduce((a, b) => a + b, 0) / 3;
    const sf = (r: TourItem) => r.kind === "tour" && (!sale || r.sale === sale);
    return {
      avg,
      avgLabel: `TB ${done.slice().reverse().map((m) => monthShort(m, refYear)).join(", ")}`,
      rows: ms.map((m) => ({
        label: monthShort(m, refYear),
        dated: items.filter((r) => sf(r) && r.hasDate && r.month === m).reduce((a, r) => a + r.students, 0),
        undated: items.filter((r) => sf(r) && !r.hasDate && r.month === m).reduce((a, r) => a + r.students, 0),
      })),
    };
  }, [items, sale, curMonth, refYear]);

  const tt = useMemo(() => {
    const ms = [5, 4, 3, 2, 1, 0].map((i) => addMonths(month, -i));
    return ms.map((m) => {
      const l = commercialTours(items, sale).filter((r) => r.month === m);
      const w = l.filter((r) => r.actualStudents !== null);
      return {
        m,
        label: monthShort(m, refYear),
        n: l.length,
        k: w.length,
        plan: w.length ? w.reduce((a, r) => a + r.students, 0) : null,
        act: w.length ? w.reduce((a, r) => a + (r.actualStudents ?? 0), 0) : null,
      };
    });
  }, [items, sale, month, refYear]);

  const dq = useMemo(() => {
    const tours = items.filter((r) => r.kind === "tour");
    const cnt = (p: string) => tours.filter((r) => r.flags.some((f) => f.startsWith(p))).length;
    return [
      `${items.length} dòng hợp lệ, trong đó ${commercial.length} tour có ngày. ${items.filter((r) => r.kind === "guest").length} dòng khách mời, CBQL và ${items.filter((r) => r.kind === "block").length} sự kiện chặn lịch không tính vào KPI thương mại nhưng vẫn hiện trên tab Lịch tour.`,
      `${items.filter((r) => !r.hasDate).length} dòng chưa xác định ngày: không tính vào KPI tháng, chỉ hiện ở "HS đã book các tháng tới" và danh sách "Chờ chốt ngày".`,
      `${items.filter((r) => r.endAssumed).length} dòng không có giờ kết thúc, áp rule: bắt đầu trước ${TOUR_RULES.morningEnd}h kết thúc ${TOUR_RULES.morningEnd}:00, còn lại kết thúc ${TOUR_RULES.afternoonEnd}:00. "Full ngày" tính ${TOUR_RULES.fullDay[0]}:00–${TOUR_RULES.fullDay[1]}:00.`,
      `${cnt("Giá trọn gói")} tour tính giá trọn gói, làm lệch HS mỗi tour và giá mỗi HS của tháng đó. ${cnt("Giá vé 0đ")} tour giá 0đ hoặc trống, ${cnt("DT dự kiến ≠")} tour có DT dự kiến khác SL × giá.`,
      `${cnt("Đã qua ngày")} tour đã qua ngày nhưng Tiến độ còn trống; ${cnt("Tiến độ Done nhưng")} tour ghi Done nhưng chưa có ngày.`,
      `SL TT mới có ở ${commercial.filter((r) => r.actualStudents !== null).length}/${commercial.length} tour.`,
      `Phân loại dòng dựa trên từ khoá trong Tên trường và Khung giờ (KHÁCH MỜI, CBQL, TEAM BUILDING, NGHỈ...). Nên bổ sung cột "Loại dòng" ở sheet gốc.`,
    ];
  }, [items, commercial]);

  const selTT = tt[tt.length - 1];
  const topSale = saleRows[0];
  const totalHS = list.reduce((a, r) => a + r.students, 0);

  const miniDefs = [
    { key: "tour", title: "Số tour", color: MC.tour, fmt: (v: number) => `${formatNumber(v)} tour` },
    { key: "size", title: "HS mỗi tour", color: MC.size, fmt: (v: number) => `${formatNumber(Math.round(v))} HS` },
    { key: "price", title: "Giá mỗi HS (nghìn đồng)", color: MC.price, fmt: (v: number) => `${formatNumber(Math.round(v))}k` },
    { key: "dt", title: "Doanh thu dự kiến (triệu)", color: MC.dt, fmt: (v: number) => `${formatNumber(v, 1)}tr` },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-muted-foreground">
          Tháng
          <select className={selectCls} value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.slice().reverse().map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
                {m > curMonth ? " (chưa diễn ra)" : m === curMonth ? " (hiện tại)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          So với
          <select className={selectCls} value={cmp} onChange={(e) => setCmp(e.target.value as CompareMode)}>
            <option value="prev">Tháng trước</option>
            <option value="avg3">TB 3 tháng trước</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Sale
          <select className={selectCls} value={sale} onChange={(e) => setSale(e.target.value)}>
            <option value="">Tất cả sale</option>
            {sales.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <div className="inline-flex items-end gap-1 rounded-lg border border-border bg-card p-1">
          {(
            [
              { id: 3, label: "3 tháng" },
              { id: 6, label: "6 tháng" },
              { id: 12, label: "12 tháng" },
              { id: 999, label: "Tất cả" },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeM(r.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                rangeM === r.id ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-medium">
        <Lightbulb className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p>{buildInsight(month, sale, cur, base)}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <StepHeader n={1} title="Toàn bộ khoảng thời gian đang chọn" subtitle={`${toDMY(range.from)} → ${toDMY(range.to)}`} />
        <div className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1">
          <span className="px-2 text-xs text-muted-foreground">Lọc nhanh:</span>
          {QUICK_RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setQuick(r.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                quick === r.key ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Số lượt tour" value={formatNumber(aggAll.n)} unit="tour" change={null} subtitle={`${toDMY(range.from)} – ${toDMY(range.to)}`} />
        <KpiCard label="Số học sinh dự kiến" value={aggAll.n ? formatNumber(aggAll.hs) : "—"} unit="HS" change={null} subtitle={`${toDMY(range.from)} – ${toDMY(range.to)}`} />
        <KpiCard label="Số trường dự kiến" value={formatNumber(schoolCountAll)} unit="trường" change={null} subtitle={`${toDMY(range.from)} – ${toDMY(range.to)}`} />
        <KpiCard label="Doanh thu dự kiến" value={aggAll.n ? formatNumber(aggAll.dt / 1_000_000, aggAll.dt < 100_000_000 ? 1 : 0) : "—"} unit="tr" change={null} subtitle={`${toDMY(range.from)} – ${toDMY(range.to)}`} />
      </div>

      <StepHeader n={2} title="So với các tháng khác thì sao?" subtitle="Cột có viền là tháng đang xem, cột nhạt là tháng chưa diễn ra. Bấm vào một cột để chuyển sang tháng đó." />
      <div className="grid gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:grid-cols-2 xl:grid-cols-4">
        {miniDefs.map((d) => (
          <div key={d.key}>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <span className="size-2.5 rounded-sm" style={{ background: d.color }} aria-hidden />
              {d.title}
            </p>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={trend} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "var(--secondary)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as (typeof trend)[number];
                    const v = row[d.key];
                    return (
                      <TooltipBox label={`${monthLabel(row.m)}${row.m > curMonth ? " (chưa diễn ra)" : ""}`}>
                        <p className="tabular-nums">{v === null || v === undefined ? "Không có tour" : d.fmt(v)}</p>
                      </TooltipBox>
                    );
                  }}
                />
                <Bar dataKey={d.key} radius={[3, 3, 0, 0]} cursor="pointer" onClick={(p: { m?: string }) => p?.m && setMonth(p.m)}>
                  {trend.map((r) => (
                    <Cell
                      key={r.m}
                      fill={r.m === month ? d.color : r.m > curMonth ? mix(d.color, 18) : mix(d.color, 50)}
                      stroke={r.m === month ? "var(--foreground)" : "none"}
                      strokeWidth={r.m === month ? 1.5 : 0}
                    />
                  ))}
                  <LabelList dataKey={d.key} position="top" formatter={(v: number | null) => (v === null ? "" : d.fmt(v))} style={{ fontSize: 9, fill: CHART_COLORS.axis }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      <StepHeader n={3} title="Vì sao? Ai phụ trách?" subtitle="Cả hai chart lọc theo tháng đang xem." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Số tour theo quy mô đoàn" subtitle="Giải thích vì sao HS mỗi tour tăng hay giảm. Màu cam là đoàn trên ngưỡng sức chứa." code="CH-TOUR-O3" isEmpty={sizeWin.length === 0}>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sizeWin} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} tick={(p: { x: number; y: number; payload: { value: string; index: number } }) => (
                <text x={p.x} y={p.y + 12} textAnchor="middle" fontSize={11} fill={CHART_COLORS.axis} fontWeight={sizeWin[p.payload.index]?.m === month ? 700 : 400}>
                  {p.payload.value}
                </text>
              )} />
              <YAxis {...axisProps} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as Record<string, number | string>;
                  return (
                    <TooltipBox label={monthLabel(String(row.m))}>
                      {TOUR_RULES.sizeBins.map((b) => (
                        <TooltipRow key={b.label} name={b.label} value={Number(row[b.label] ?? 0)} unit="tour" />
                      ))}
                    </TooltipBox>
                  );
                }}
              />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              {TOUR_RULES.sizeBins.map((b, i) => (
                <Bar key={b.label} dataKey={b.label} stackId="s" fill={mix(CHART_COLORS.primary, [25, 50, 75, 100][i] as number)}>
                  <LabelList dataKey={b.label} position="center" formatter={(v: number) => (v > 0 ? formatNumber(v) : "")} style={{ fontSize: 10, fill: "#fff", fontWeight: 600 }} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="HS dự kiến theo sale"
          subtitle={
            list.length && topSale
              ? `${monthLabel(month)}: ${topSale.name} phụ trách ${formatNumber(Math.round((topSale.cur / (totalHS || 1)) * 100))}% HS. Cột nhạt là ${base.label}${cmp === "avg3" ? " (bình quân tháng)" : ""}.`
              : EMPTY_TEXT
          }
          code="CH-TOUR-O4"
          isEmpty={saleRows.length === 0}
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={saleRows} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={(v: number) => formatNumber(v)} />
              <YAxis type="category" dataKey="name" {...axisProps} width={90} tick={YCategoryTick} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0]?.payload as (typeof saleRows)[number];
                  return (
                    <TooltipBox label={r.name}>
                      <TooltipRow color={CHART_COLORS.primary} name={monthShort(month, refYear)} value={r.cur} unit={`HS, ${r.curN} tour`} />
                      <TooltipRow color={CHART_COLORS.support} name={base.label} value={Math.round(r.base)} unit={`HS, ${formatNumber(r.baseN, cmp === "avg3" ? 1 : 0)} tour`} />
                    </TooltipBox>
                  );
                }}
              />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="cur" name={monthShort(month, refYear)} fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="cur" position="right" formatter={(v: number) => formatShort(v)} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
              </Bar>
              <Bar dataKey="base" name={base.label} fill={mix(CHART_COLORS.support, 70)} radius={[0, 4, 4, 0]}>
                <LabelList dataKey="base" position="right" formatter={(v: number) => formatShort(v)} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <StepHeader n={4} title="Sắp tới và thực tế" subtitle="Nhìn trước lượng booking và đối chiếu số HS thực tế đã ghi nhận." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="HS đã book các tháng tới" subtitle={`Tính đến ${dm(today)}/${today.slice(0, 4)}. Đường nét đứt là ${pipe.avgLabel}.`} code="CH-TOUR-O5">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={pipe.rows} margin={{ top: 16, right: 8, left: -6, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0]?.payload as (typeof pipe.rows)[number];
                  const tot = r.dated + r.undated;
                  return (
                    <TooltipBox label={r.label}>
                      <TooltipRow color={CHART_COLORS.primary} name="Đã có ngày" value={r.dated} unit="HS" />
                      <TooltipRow color={CHART_COLORS.support} name="Chưa xác định ngày" value={r.undated} unit="HS" />
                      <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">
                        Tổng {formatNumber(tot)} HS{pipe.avg ? `, bằng ${formatNumber(Math.round((tot / pipe.avg) * 100))}% ${pipe.avgLabel}` : ""}
                      </p>
                    </TooltipBox>
                  );
                }}
              />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="dated" name="Đã có ngày" stackId="p" fill={CHART_COLORS.primary}>
                <LabelList dataKey="dated" position="center" formatter={(v: number) => (v > 0 ? formatNumber(v) : "")} style={{ fontSize: 10, fill: "#fff", fontWeight: 600 }} />
              </Bar>
              <Bar dataKey="undated" name="Chưa xác định ngày" stackId="p" fill={mix(CHART_COLORS.support, 80)} radius={[4, 4, 0, 0]}>
                <LabelList dataKey="undated" position="center" formatter={(v: number) => (v > 0 ? formatNumber(v) : "")} style={{ fontSize: 10, fill: CHART_COLORS.axis, fontWeight: 600 }} />
              </Bar>
              {pipe.avg > 0 && <ReferenceLine y={pipe.avg} stroke="var(--foreground)" strokeDasharray="6 4" ifOverflow="extendDomain" />}
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="HS dự kiến và HS thực tế"
          subtitle={
            selTT && selTT.k
              ? `${monthLabel(month)}: thực tế đạt ${formatNumber(Math.round(((selTT.act ?? 0) / (selTT.plan || 1)) * 100))}% dự kiến, trên ${selTT.k}/${selTT.n} tour có nhập SL TT. Tháng chưa có SL TT để trống.`
              : `Tháng chưa có SL TT để trống. Toàn bộ lịch mới có ${commercial.filter((r) => r.actualStudents !== null).length}/${commercial.length} tour nhập SL TT.`
          }
          code="CH-TOUR-O6"
        >
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={tt} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={(v: number) => formatNumber(v)} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const r = payload[0]?.payload as (typeof tt)[number];
                  return (
                    <TooltipBox label={monthLabel(r.m)}>
                      {r.k ? (
                        <>
                          <TooltipRow color={MC.price} name="Dự kiến (tour có SL TT)" value={r.plan ?? 0} unit="HS" />
                          <TooltipRow color={MC.tour} name="Thực tế (SL TT)" value={r.act ?? 0} unit="HS" />
                          <p className="mt-1 text-muted-foreground">
                            Tỷ lệ thực hiện {formatNumber(Math.round(((r.act ?? 0) / (r.plan || 1)) * 100))}%, {r.k}/{r.n} tour có SL TT
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">Chưa có SL TT</p>
                      )}
                    </TooltipBox>
                  );
                }}
              />
              <Legend iconType="square" iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="plan" name="HS dự kiến (tour có SL TT)" fill={mix(MC.price, 80)} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="plan" position="top" formatter={(v: number | null) => (v === null ? "" : formatNumber(v))} style={{ fontSize: 9, fill: CHART_COLORS.axis }} />
              </Bar>
              <Bar dataKey="act" name="HS thực tế (SL TT)" fill={MC.tour} radius={[3, 3, 0, 0]}>
                <LabelList dataKey="act" position="top" formatter={(v: number | null) => (v === null ? "" : formatNumber(v))} style={{ fontSize: 9, fill: CHART_COLORS.axis }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <details className="rounded-xl border border-border bg-card p-4 shadow-xs">
        <summary className="cursor-pointer text-sm font-semibold">Chất lượng dữ liệu và giả định đang áp dụng</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {dq.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}

/* ================================================================== */
/* TAB 2 — Lịch tour (heatmap tháng → tuần  ⇄  timeline trong tuần)    */
/* ================================================================== */

const EMPTY_DAY: DayInfo = { items: [], load: 0, tours: 0, hasOther: false, peak: 0 };
const heatPct = (v: number) => (v <= 0 ? 0 : v <= 100 ? 18 : v <= 200 ? 40 : v <= 300 ? 70 : 100);

function TourSchedule({ items, today, active }: { items: TourItem[]; today: string; active: boolean }) {
  const curMonth = today.slice(0, 7);
  const dated = useMemo(() => items.filter((r) => r.hasDate && r.date), [items]);
  const undated = useMemo(() => items.filter((r) => !r.hasDate).sort((a, b) => a.month.localeCompare(b.month)), [items]);
  /** Chỉ hiển thị 1 tháng trước + tháng hiện tại + 2 tháng tới cho gọn (thay vì toàn bộ tháng có dữ liệu). */
  const heatMonths = useMemo(() => {
    const all = Array.from(new Set([...dated.map((r) => r.month), curMonth])).sort();
    const from = addMonths(curMonth, -1);
    const to = addMonths(curMonth, 2);
    const windowed = all.filter((m) => m >= from && m <= to);
    return windowed.length ? windowed : all;
  }, [dated, curMonth]);

  const [week, setWeek] = useState(mondayOf(today));
  const [focusDay, setFocusDay] = useState<string | null>(today);
  const [open, setOpen] = useState<Set<string>>(() => new Set([curMonth]));
  const [sale] = useState("");
  const [kinds] = useState<Set<TourKind>>(() => new Set<TourKind>(["tour", "guest", "block"]));
  const [selId, setSelId] = useState<number | null>(null);
  const [scope, setScope] = useState<"week" | "month" | "all">("all");
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

  const selectWeek = useCallback((w: string, d: string | null) => {
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Số tour trong tuần" value={formatNumber(wk.tours)} unit="tour" change={null} subtitle={`${dm(week)} – ${dm(addDays(week, 6))}`} />
        <KpiCard label="Tổng HS (tải vận hành)" value={formatNumber(wk.hs)} unit="HS" change={null} subtitle="Gồm cả khách mời" />
        <KpiCard label="Ngày cao điểm" value={wk.peak > 0 ? `${WEEKDAYS[weekdayIdx(wk.peakDay)]} ${dm(wk.peakDay)}` : "—"} change={null} subtitle={wk.peak > 0 ? `${formatNumber(wk.peak)} HS` : "Tuần trống"} />
        <KpiCard label="Chưa cập nhật tiến độ" value={formatNumber(wk.noStatus)} unit="tour" change={null} valueClassName={wk.noStatus ? "text-[var(--brand-accent)]" : undefined} subtitle="Tour trong tuần" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(360px,5fr)_minmax(0,8fr)]">
        {/* ---------------- Heatmap tháng → tuần ---------------- */}
        <section ref={hmCard} className="rounded-xl border border-border bg-card p-4 shadow-xs">
          <h2 className="text-sm font-semibold">Tải theo ngày</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Bấm tên tháng để mở các tuần. Bấm một ngày hoặc một tuần để xem lịch bên cạnh.</p>
          <div className="my-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {[
              [18, "1–100 HS"],
              [40, "101–200"],
              [70, "201–300"],
            ].map(([p, l]) => (
              <span key={l} className="inline-flex items-center gap-1">
                <i className="inline-block size-3 rounded-sm" style={{ background: mix(CHART_COLORS.primary, p as number) }} />
                {l}
              </span>
            ))}
            <span className="inline-flex items-center gap-1">
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block size-1.5 rounded-full bg-muted-foreground" />
              Có khách mời hoặc sự kiện
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
                  const byWd = [0, 0, 0, 0, 0, 0, 0];
                  const cnt = [0, 0, 0, 0, 0, 0, 0];
                  dated.filter((r) => r.month === m && r.kind === "tour").forEach((r) => {
                    const i = weekdayIdx(r.date as string);
                    byWd[i] = (byWd[i] ?? 0) + r.students;
                    cnt[i] = (cnt[i] ?? 0) + 1;
                  });
                  const tours = cnt.reduce((a, b) => a + b, 0);
                  const hs = byWd.reduce((a, b) => a + b, 0);
                  const toggleMonth = () =>
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
                  return (
                    <Fragment key={m}>
                      <tr className="cursor-pointer" onClick={toggleMonth} aria-expanded={isOpen}>
                        <th className="whitespace-nowrap px-1 py-1.5 text-left font-semibold">
                          <button type="button" className="text-left" onClick={(e) => { e.stopPropagation(); toggleMonth(); }}>
                            <span className="inline-block w-3 text-muted-foreground">{isOpen ? "▾" : "▸"}</span> {monthLabel(m)}
                            <span className="block pl-3 text-[11px] font-normal text-muted-foreground">
                              {formatNumber(tours)} tour, {formatNumber(hs)} HS
                            </span>
                          </button>
                        </th>
                        {byWd.map((v, i) => (
                          <td key={i} className="rounded bg-secondary/60 py-1.5 text-center text-[11px] text-muted-foreground" title={`${WEEKDAYS[i]} trong ${monthLabel(m)}: ${cnt[i]} tour, ${formatNumber(v)} HS`}>
                            <b className="block text-xs text-foreground">{cnt[i] || "–"}</b>
                            {cnt[i] ? "tour" : ""}
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
                                const pct = heatPct(inf.load);
                                const out = d.slice(0, 7) !== m;
                                const isFocus = isSel && d === focusDay;
                                return (
                                  <td
                                    key={d}
                                    className={cn(
                                      "relative h-11 cursor-pointer rounded-md border p-0 text-center align-middle",
                                      isSel ? "border-primary" : "border-border",
                                      out && "opacity-40",
                                    )}
                                    style={{
                                      background: pct ? mix(CHART_COLORS.primary, pct) : "transparent",
                                      color: pct >= 70 ? "#fff" : undefined,
                                      boxShadow: isFocus ? "inset 0 0 0 2px var(--foreground)" : undefined,
                                    }}
                                    title={`${WEEKDAYS[i]} ${dm(d)}: ${inf.tours} tour, ${formatNumber(inf.load)} HS`}
                                    onClick={() => selectWeek(w, d)}
                                  >
                                    <span
                                      className={cn("absolute left-1 top-0.5 text-[10px]", d === today && "rounded px-1 text-white")}
                                      style={d === today ? { background: WARN } : { opacity: 0.8 }}
                                    >
                                      {Number(d.slice(8))}
                                    </span>
                                    <span className="text-[13px] font-semibold tabular-nums">{inf.load ? formatNumber(inf.load) : ""}</span>
                                    {inf.hasOther && <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-muted-foreground" />}
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
            </div>
          </div>

          <div className="grid grid-cols-[112px_1fr] text-[11px] text-muted-foreground">
            <span />
            <div className="relative h-4">
              {Array.from({ length: span + 1 }, (_, i) =>
                i % 2 === 0 || i === span ? (
                  <span key={i} className="absolute -translate-x-1/2" style={{ left: `${(i / span) * 100}%` }}>
                    {a0 + i}h
                  </span>
                ) : null,
              )}
            </div>
          </div>

          {weekDays.map((d, i) => {
            const inf = weekInfos[i] as DayInfo;
            const bars = inf.items.filter((r) => kinds.has(r.kind) && r.start !== null && r.end !== null).sort((a, b) => (a.start as number) - (b.start as number) || (b.end as number) - (a.end as number));
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
              <div key={d} className={cn("grid min-h-12 grid-cols-[112px_1fr] border-t border-border", d === focusDay && "bg-primary/5")}>
                <button type="button" className="py-1.5 pr-1.5 text-left text-xs leading-snug" onClick={() => setFocusDay(d)}>
                  <b className="text-[13px]">
                    {WEEKDAYS[i]} {dm(d)}
                  </b>
                  {d === today && <span className="ml-1 inline-block whitespace-nowrap rounded-full border px-1.5 text-[10px]" style={{ borderColor: WARN, color: WARN }}>Hôm nay</span>}
                  <span className="block text-muted-foreground">{inf.load ? `${formatNumber(inf.load)} HS, ${inf.tours} tour` : "Trống"}</span>
                </button>
                <div
                  className="relative"
                  style={{
                    height: lanes * 28 + 8,
                    backgroundImage: "linear-gradient(to right, var(--border) 1px, transparent 1px)",
                    backgroundSize: `calc(100% / ${span}) 100%`,
                  }}
                >
                  {bars.map((r) => {
                    const s = Math.max(r.start as number, a0);
                    const e = Math.min(r.end as number, a1);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelId(r.id)}
                        title={`${r.schoolName}\n${hhmm(r.start as number)}–${hhmm(r.end as number)}${r.endAssumed ? " (kết thúc theo rule)" : ""}\n${formatNumber(r.students)} HS${r.sale ? `, sale ${r.sale}` : ""}${r.grade ? `, ${r.grade}` : ""}\n${r.status}`}
                        className={cn(
                          "absolute h-6 truncate rounded px-1.5 text-left text-[11px] leading-6",
                          BAR_CLS[r.kind],
                          sale && r.sale !== sale && "opacity-25",
                          selId === r.id && "ring-2 ring-foreground",
                        )}
                        style={{
                          left: `${((s - a0) / span) * 100}%`,
                          width: `calc(${((e - s) / span) * 100}% - 2px)`,
                          top: 4 + (lane.get(r.id) ?? 0) * 28,
                          borderRightStyle: r.endAssumed ? "dashed" : undefined,
                        }}
                      >
                        {r.kind === "block" ? r.schoolName : `${r.schoolName} · ${formatNumber(r.students)} HS`}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          <div className="mt-2 min-h-36 border-t border-border pt-2 text-sm">
            {!sel ? (
              <p className="text-xs text-muted-foreground">Bấm vào một tour trên lịch để xem đầy đủ thông tin.</p>
            ) : (
              <TourDetail r={sel} />
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Tải theo sale trong tuần" subtitle="HS dự kiến và số tour mỗi sale phụ trách." isEmpty={wk.bySale.length === 0}>
          <div className="grid gap-2">
            {wk.bySale.map(([s, v]) => {
              const max = Math.max(1, ...wk.bySale.map((x) => x[1].hs));
              return (
                <div key={s} className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
                  <span className="truncate">{s}</span>
                  <div>
                    <div className="h-4 rounded-sm" style={{ width: `${(v.hs / max) * 100}%`, minWidth: 2, background: CHART_COLORS.primary, opacity: sale && sale !== s ? 0.3 : 1 }} />
                    <span className="text-[11px] text-muted-foreground">
                      {formatNumber(v.hs)} HS, {v.n} tour
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Chờ chốt ngày" subtitle="Tour đã có trong lịch nhưng chưa xác định ngày, chưa hiện được trên lịch." isEmpty={undated.length === 0}>
          <ul className="max-h-72 divide-y divide-border overflow-auto text-sm">
            {undated.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-2 py-1.5">
                <span>
                  <b className="font-semibold">{r.schoolName}</b>
                  <span className="block text-xs text-muted-foreground">
                    {monthLabel(r.month)}, {r.sale ?? "chưa có sale"}
                    {r.month < curMonth && (
                      <span className="ml-1 rounded-full border px-1.5 text-[10px]" style={{ borderColor: WARN, color: WARN }}>
                        Quá tháng dự kiến
                      </span>
                    )}
                  </span>
                </span>
                <span className="whitespace-nowrap text-xs tabular-nums">{r.students ? `${formatNumber(r.students)} HS` : "Chưa có SL"}</span>
              </li>
            ))}
          </ul>
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

function F({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{k}</dt>
      <dd className="font-semibold">{v}</dd>
    </div>
  );
}

function TourDetail({ r }: { r: TourItem }) {
  const diff = r.actualStudents !== null ? r.actualStudents - r.students : null;
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-2">
        <b>{r.schoolName}</b>
        <span className="rounded-full border border-border px-2 text-[11px] text-muted-foreground">{KIND_LABEL[r.kind]}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-4">
        <F
          k="Ngày, giờ"
          v={`${r.date ? `${WEEKDAYS[weekdayIdx(r.date)]} ${dm(r.date)}` : "Chưa có ngày"}, ${r.start !== null && r.end !== null ? `${hhmm(r.start)}–${hhmm(r.end)}` : (r.timeRaw ?? "—")}${r.endAssumed ? " (kết thúc theo rule)" : ""}`}
        />
        <F k="Sale" v={r.sale ?? "—"} />
        <F k="Khối lớp" v={r.grade ?? "—"} />
        <F k="SL HS dự kiến" v={formatNumber(r.students)} />
        <F k="SL TT" v={r.actualStudents !== null ? `${formatNumber(r.actualStudents)}${diff !== null ? ` (${diff > 0 ? "+" : ""}${formatNumber(diff)})` : ""}` : "—"} />
        <F k="Giá vé, DT dự kiến" v={`${r.price ? fK(r.price) : "—"}, ${r.revenue ? fTr(r.revenue) : "—"}`} />
        <F k="Tiến độ" v={r.status} />
        <F k="Khu vực" v={r.region ?? "—"} />
      </dl>
      {(r.note || r.note2) && <p className="mt-1.5 text-xs text-muted-foreground">Ghi chú: {[r.note, r.note2].filter(Boolean).join(" | ")}</p>}
      {r.flags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
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
  { key: "flags", header: "Lưu ý dữ liệu", render: (r) => r.flags.join("; ") },
];