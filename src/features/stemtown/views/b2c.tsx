import { Package, Repeat, Users, Wallet, BadgePercent } from "lucide-react";
import { CustomChartsSection } from "@/features/stemtown/components/CustomChartsSection";
import { Fragment, useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  CHART_COLORS,
  DONUT_COLORS,
  TooltipBox,
  TooltipRow,
  TargetRow,
  axisProps,
  renderInsideLabel,
  shortLabel,
  DonutLegend,
  categoryColor,
  XCategoryTick,
  YCategoryTick,
} from "@/features/stemtown/components/chart-kit";
import { FactTable, type Column } from "@/features/stemtown/components/fact-table";
import { DataTableView } from "@/features/stemtown/components/data-table-view";
import { FilterBar } from "@/features/stemtown/components/filters";
import { KpiCard } from "@/features/stemtown/components/kpi";
import { InsightList, Panel, SectionHeader } from "@/features/stemtown/components/panel";
import { DashboardShell } from "@/features/stemtown/components/shell";
import {
  b2cBranchOptions,
  bucketLabel,
  bucketOf,
  defaultFilters,
  filterB2C,
  groupSum,
  sortBuckets,
  targetFor,
  targetForBucket,
  targetSubMetric,
  toSortedPairs,
  type B2CRow,
  type Filters,
  type TimeUnit,
} from "@/features/stemtown/lib/dashboard-data";
import { formatCurrency, formatNumber, formatPercent, formatShort, maskCustomerName } from "@/features/stemtown/lib/format";
import {
  attachCompare,
  isCompareValid,
  withFullPeriod,
  type CompareMode,
} from "@/features/stemtown/lib/compare";
import { cellFill, matchSel, useCrossFilter } from "@/features/stemtown/lib/cross-filter";
import { cn } from "@/lib/utils";

const CROSS_LABELS = {
  category: "Danh mục",
  source: "Nguồn đơn",
  product: "Sản phẩm",
  phone: "Khách hàng",
  bucket: "Kỳ",
  freq: "Số lần mua",
  staff: "Nhân viên phụ trách",
  promo: "CTKM",
  customer: "Loại khách",
  promoStatus: "CTKM (có/không)",
  matrixMonth: "Tháng (matrix)",
};


const WEEKDAY_ORDER = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

/** yyyy-MM-dd -> dd-MM-yy (dễ nhìn trong bảng chi tiết). */
const toDMY = (s: string) => {
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}-${m}-${y.slice(2)}` : s;
};

// Màu cho cơ cấu số lần mua: OMBRE VÀNG theo logo (vàng nhạt → cam gold đậm dần)
// cho 1 → 2 → 3+ đơn. Tươi sáng, dễ phân biệt các lát.
const FREQ_COLORS = ["oklch(0.90 0.09 92)", "oklch(0.82 0.15 78)", "oklch(0.71 0.16 62)"];

/** Breakdown dùng chung cho 3 chart theo thời gian (Doanh thu/SL SP/SL đơn hàng) — TOGGLE chỉ đổi
 *  dimension phân rã, KHÔNG đổi metric (metric cố định theo tên chart). */
type BreakdownDim = "category" | "staff" | "customer" | "promo";
const BREAKDOWN_LABELS: Record<BreakdownDim, string> = {
  category: "Danh mục sản phẩm",
  staff: "Nhân viên",
  customer: "Khách hàng",
  promo: "Khuyến mãi",
};
const CUSTOMER_KEYS = ["Khách mua một lần", "Khách quay lại", "Không có SĐT"];
const CUSTOMER_COLORS: Record<string, string> = {
  "Khách mua một lần": CHART_COLORS.dark,
  "Khách quay lại": CHART_COLORS.primary,
  "Không có SĐT": CHART_COLORS.axis,
};
const PROMO_KEYS = ["Có KM", "Không có KM"];
const PROMO_COLORS: Record<string, string> = { "Có KM": CHART_COLORS.primary, "Không có KM": CHART_COLORS.axis };

function BreakdownTimelineChart({
  title,
  subtitle,
  code,
  unit,
  valueFn,
  rows,
  buckets,
  timeUnit,
  categories,
  top5Staff,
  staffGroupOf,
  firstOrderByPhone,
  toggle,
  targetOf,
}: {
  title: string;
  subtitle: string;
  code: string;
  unit: string;
  valueFn: (r: B2CRow) => number;
  rows: B2CRow[];
  buckets: string[];
  timeUnit: TimeUnit;
  categories: string[];
  top5Staff: string[];
  staffGroupOf: (name: string) => string;
  firstOrderByPhone: Map<string, string>;
  toggle: (dim: string, v?: string) => void;
  targetOf?: (bucket: string) => number | null;
}) {
  const [dim, setDim] = useState<BreakdownDim>("category");

  const { keys, colorOf, series } = useMemo(() => {
    const keys =
      dim === "category" ? categories : dim === "staff" ? [...top5Staff, "Nhân viên khác"] : dim === "customer" ? CUSTOMER_KEYS : PROMO_KEYS;
    const colorOf = (k: string, i: number) =>
      dim === "category" ? categoryColor(k) : dim === "customer" ? (CUSTOMER_COLORS[k] ?? CHART_COLORS.axis) : dim === "promo" ? (PROMO_COLORS[k] ?? CHART_COLORS.axis) : (DONUT_COLORS[i % DONUT_COLORS.length] as string);
    const keyOf = (r: B2CRow): string => {
      if (dim === "category") return r.category;
      if (dim === "staff") return staffGroupOf(r.assignedStaff ?? "Chưa gán NV");
      if (dim === "customer") {
        if (!r.phone) return "Không có SĐT";
        return firstOrderByPhone.get(r.phone) === r.orderCode ? "Khách mua một lần" : "Khách quay lại";
      }
      return r.promoCode ? "Có KM" : "Không có KM";
    };
    const byBucket = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const b = bucketOf(r.date, timeUnit);
      let m = byBucket.get(b);
      if (!m) {
        m = new Map();
        byBucket.set(b, m);
      }
      m.set(keyOf(r), (m.get(keyOf(r)) ?? 0) + valueFn(r));
    }
    const series = buckets.map((b) => {
      const m = byBucket.get(b);
      const entry: Record<string, number | string> = { bucket: b, name: bucketLabel(b, timeUnit) };
      let total = 0;
      for (const k of keys) {
        const v = m?.get(k) ?? 0;
        entry[k] = v;
        total += v;
      }
      entry.total = total;
      if (targetOf) {
        const t = targetOf(b);
        if (t !== null) entry.target = t;
      }
      return entry;
    });
    return { keys, colorOf, series };
  }, [dim, rows, buckets, timeUnit, categories, top5Staff, staffGroupOf, firstOrderByPhone, targetOf]);

  return (
    <Panel title={title} subtitle={subtitle} code={code} isEmpty={series.every((r) => Number(r["total"] ?? 0) === 0)}>
      <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {(["category", "staff", "customer", "promo"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDim(d)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              dim === d ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {BREAKDOWN_LABELS[d]}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart
          data={series}
          margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
          onClick={(e: { activePayload?: { payload?: { bucket?: string } }[] }) => toggle("bucket", e?.activePayload?.[0]?.payload?.bucket)}
          style={{ cursor: "pointer" }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} />
          <YAxis {...axisProps} tickFormatter={shortLabel} width={44} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as Record<string, number | string>;
              const total = Number(row["total"] ?? 0);
              return (
                <TooltipBox label={String(label)}>
                  {keys.map((k, i) => (
                    <TooltipRow key={k} color={colorOf(k, i)} name={k} value={Number(row[k] ?? 0)} unit={unit} share={total ? (Number(row[k] ?? 0) / total) * 100 : undefined} />
                  ))}
                  <TooltipRow name="Tổng" value={total} unit={unit} />
                </TooltipBox>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} name={k} stackId="a" fill={colorOf(k, i)}>
              {i === keys.length - 1 && <LabelList dataKey="total" position="top" formatter={(v: number) => shortLabel(v)} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />}
            </Bar>
          ))}
          {targetOf && <Line type="monotone" dataKey="target" name="Target" stroke={CHART_COLORS.accent} strokeWidth={2} strokeDasharray="4 4" dot={false} connectNulls={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </Panel>
  );
}

type CustomerMetric = "value" | "orderCount" | "quantity";
const CUSTOMER_METRIC_LABELS: Record<CustomerMetric, string> = { value: "Chi tiêu", orderCount: "Số đơn", quantity: "Số lượng SP" };

function TopCustomersChart({
  customers,
  selectedPhone,
  onSelect,
}: {
  customers: { name: string; phone: string; value: number; orderCount: number; quantity: number; lastDate: string }[];
  selectedPhone?: string | null;
  onSelect: (phone?: string) => void;
}) {
  const [metric, setMetric] = useState<CustomerMetric>("value");
  const top10 = useMemo(() => [...customers].sort((a, b) => b[metric] - a[metric]).slice(0, 10), [customers, metric]);

  return (
    <>
      <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {(["value", "orderCount", "quantity"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMetric(m)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              metric === m ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {CUSTOMER_METRIC_LABELS[m]}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={top10} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis type="number" {...axisProps} tickFormatter={metric === "value" ? shortLabel : (v: number) => formatNumber(v)} />
          <YAxis type="category" dataKey="name" {...axisProps} width={140} tick={YCategoryTick} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as (typeof top10)[number];
              return (
                <TooltipBox label={row.name}>
                  <p className="mb-1 text-muted-foreground">SĐT: {row.phone}</p>
                  <TooltipRow name="Tổng chi tiêu" value={row.value} />
                  <TooltipRow name="Số đơn" value={row.orderCount} unit="đơn" />
                  <TooltipRow name="Số lượng SP" value={row.quantity} unit="SP" />
                  <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">Lần mua gần nhất: {toDMY(row.lastDate)}</p>
                </TooltipBox>
              );
            }}
          />
          <Bar dataKey={metric} radius={[0, 4, 4, 0]} cursor="pointer" onClick={(d: { phone?: string }) => onSelect(d?.phone)}>
            {top10.map((c) => (
              <Cell key={c.phone} fill={cellFill(c.phone, selectedPhone, CHART_COLORS.primary)} />
            ))}
            <LabelList dataKey={metric} position="right" formatter={(v: number) => (metric === "value" ? formatShort(v) : formatNumber(v))} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
}

type PromoTableRow = { name: string; value: number; orders: number; cost: number; newCustomers: number; from: string; to: string };
function PromoTable({ rows, selected, onSelect }: { rows: PromoTableRow[]; selected?: string | null; onSelect: (name: string) => void }) {
  type SortKey = "name" | "period" | "orders" | "newCustomers" | "before" | "pct" | "cost" | "value";
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "value", dir: -1 });
  const enriched = rows.map((r) => ({ ...r, before: r.value + r.cost, pct: r.value + r.cost ? (r.cost / (r.value + r.cost)) * 100 : 0 }));
  const sorted = [...enriched].sort((a, b) => {
    const va = sort.key === "period" ? a.from : a[sort.key];
    const vb = sort.key === "period" ? b.from : b[sort.key];
    if (typeof va === "string" || typeof vb === "string") return sort.dir * String(va).localeCompare(String(vb));
    return sort.dir * ((va as number) - (vb as number));
  });
  const cols: { key: SortKey; label: string; align?: "right" }[] = [
    { key: "name", label: "Mã KM" },
    { key: "period", label: "Thời gian" },
    { key: "orders", label: "Lượt dùng", align: "right" },
    { key: "newCustomers", label: "KH mới", align: "right" },
    { key: "before", label: "DT trước KM", align: "right" },
    { key: "pct", label: "% giảm", align: "right" },
    { key: "cost", label: "Tiền KM", align: "right" },
    { key: "value", label: "DT sau KM", align: "right" },
  ];
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }));
  return (
    <div className="max-h-[280px] overflow-y-auto overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card">
          <tr className="text-muted-foreground">
            {cols.map((c) => (
              <th key={c.key} className={cn("cursor-pointer select-none whitespace-nowrap px-2 py-1.5 font-medium hover:text-foreground", c.align === "right" ? "text-right" : "text-left")} onClick={() => toggleSort(c.key)}>
                {c.label} {sort.key === c.key ? (sort.dir === 1 ? "▲" : "▼") : "⇅"}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.name}
              onClick={() => onSelect(r.name)}
              className={cn("cursor-pointer border-t border-border/60 hover:bg-secondary/60", selected === r.name && "bg-primary/10")}
            >
              <td className="px-2 py-1.5">{r.name}</td>
              <td className="px-2 py-1.5 whitespace-nowrap">{r.from === r.to ? toDMY(r.from) : `${toDMY(r.from)} – ${toDMY(r.to)}`}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.orders)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.newCustomers)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.before)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatPercent(r.pct)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.cost)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StaffRevenueQtyChart({ staffChart, sel, toggle }: { staffChart: Record<string, number | string | null>[]; sel: Record<string, string | null | undefined>; toggle: (dim: string, v?: string) => void }) {
  const [qtyMode, setQtyMode] = useState<"product" | "order">("product");
  const qtyKey = qtyMode === "product" ? "productCount" : "orderCount";
  const qtyLabel = qtyMode === "product" ? "Số lượng SP" : "Số lượng đơn hàng";
  return (
    <>
      <div className="mb-2 inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {(["product", "order"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setQtyMode(m)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              qtyMode === m ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60",
            )}
          >
            {m === "product" ? "Số lượng SP" : "Số lượng đơn hàng"}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={staffChart} margin={{ top: 16, right: 8, left: 0, bottom: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
          <XAxis dataKey="name" {...axisProps} height={38} tick={XCategoryTick} interval={0} />
          <YAxis yAxisId="left" {...axisProps} tickFormatter={shortLabel} width={50} />
          <YAxis yAxisId="right" orientation="right" {...axisProps} tickFormatter={(v: number) => formatNumber(v)} width={44} />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload as Record<string, number>;
              return (
                <TooltipBox label={String(label)}>
                  <TooltipRow color={CHART_COLORS.primary} name="Doanh thu" value={Number(row["total"] ?? 0)} />
                  <TooltipRow color={CHART_COLORS.dark} name={qtyLabel} value={Number(row[qtyKey] ?? 0)} unit={qtyMode === "product" ? "SP" : "đơn"} />
                  <TooltipRow name="Số khách phụ trách" value={Number(row["customerCount"] ?? 0)} unit="khách" />
                </TooltipBox>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="total" name="Doanh thu" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} cursor="pointer" onClick={(d: { name?: string }) => String(d?.name) !== "Nhân viên khác" && toggle("staff", d?.name)}>
            {staffChart.map((d) => (
              <Cell key={String(d.name)} fill={cellFill(String(d.name), sel["staff"], CHART_COLORS.primary)} />
            ))}
            <LabelList dataKey="total" position="top" formatter={(v: number) => shortLabel(v)} style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
          </Bar>
          <Line yAxisId="right" type="monotone" dataKey={qtyKey} name={qtyLabel} stroke={CHART_COLORS.dark} strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

export function B2CPage() {
  const [filters, setFilters] = useState<Filters>({ ...defaultFilters, model: "b2c" });
  const { sel, toggle, clear, clearAll, chips } = useCrossFilter(CROSS_LABELS);
  const selectedPhone = sel["phone"] ?? null;
  const [compareMode] = useState<CompareMode>("none");
  const compare: CompareMode = isCompareValid(filters.timeUnit, compareMode) ? compareMode : "none";
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const data = useMemo(() => {
    const keep = (r: B2CRow) =>
      matchSel(r.category, sel["category"]) &&
      matchSel(r.source, sel["source"]) &&
      matchSel(r.productName, sel["product"]) &&
      matchSel(r.phone, selectedPhone) &&
      matchSel(r.assignedStaff, sel["staff"]) &&
      matchSel(r.promoCode, sel["promo"]) &&
      matchSel(r.promoCode ? "Có CTKM" : "Không có CTKM", sel["promoStatus"]) &&
      matchSel(r.date ? r.date.slice(0, 7) : null, sel["matrixMonth"]) &&
      matchSel(bucketOf(r.date, filters.timeUnit), sel["bucket"]);
    const rowsBase = filterB2C(filters).filter(keep);
    // Cross-filter theo số lần mua (freq): nhóm mua của từng SĐT tính trên tập ĐÃ lọc (chưa lọc freq)
    const withPhoneBase = rowsBase.filter((r) => r.phone);
    const ordersByPhoneBase = new Map<string, Set<string>>();
    for (const r of withPhoneBase) {
      const set = ordersByPhoneBase.get(r.phone as string) ?? new Set<string>();
      set.add(r.orderCode);
      ordersByPhoneBase.set(r.phone as string, set);
    }
    const freqLabelOf = (n: number) => (n >= 3 ? "Mua 3+ đơn" : n === 2 ? "Mua 2 đơn" : "Mua 1 đơn");
    const phoneFreqBucket = new Map<string, string>();
    for (const [phone, set] of ordersByPhoneBase) phoneFreqBucket.set(phone, freqLabelOf(set.size));
    const selFreq = sel["freq"] ?? null;
    let rows = selFreq
      ? rowsBase.filter((r) => r.phone && phoneFreqBucket.get(r.phone) === selFreq)
      : rowsBase;

    // Cần firstOrderByPhone SỚM (trước khi tính KPI) để cross-filter theo "customer" (Khách mua một
    // lần/quay lại/Không có SĐT) áp dụng nhất quán cho TOÀN trang, không chỉ vài chart tính sau.
    {
      const withPhone0 = rows.filter((r) => r.phone);
      const orderInfo0 = new Map<string, { phone: string; date: string; revenue: number }>();
      for (const r of withPhone0) {
        const cur = orderInfo0.get(r.orderCode) ?? { phone: r.phone as string, date: r.date, revenue: 0 };
        cur.revenue += r.revenue;
        if (r.date && (!cur.date || r.date < cur.date)) cur.date = r.date;
        orderInfo0.set(r.orderCode, cur);
      }
      const byPhone0 = new Map<string, { code: string; date: string }[]>();
      for (const [code, info] of orderInfo0.entries()) {
        const arr = byPhone0.get(info.phone) ?? [];
        arr.push({ code, date: info.date });
        byPhone0.set(info.phone, arr);
      }
      const firstOrderByPhone0 = new Map<string, string>();
      for (const [phone, arr] of byPhone0) {
        arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1));
        firstOrderByPhone0.set(phone, arr[0]!.code);
      }
      const wantCustomer = sel["customer"];
      if (wantCustomer) {
        rows = rows.filter((r) => {
          const key = !r.phone ? "Không có SĐT" : firstOrderByPhone0.get(r.phone) === r.orderCode ? "Khách mua một lần" : "Khách quay lại";
          return key === wantCustomer;
        });
      }
    }

    const revenue = rows.reduce((s, r) => s + r.revenue, 0);
    const quantity = rows.reduce((s, r) => s + r.quantity, 0);
    const discount = rows.reduce((s, r) => s + r.discount, 0);
    const orders = new Set(rows.map((r) => r.orderCode)).size;
    const withPhone = rows.filter((r) => r.phone);
    const customers = new Set(withPhone.map((r) => r.phone)).size;
    const aov = orders > 0 ? revenue / orders : null;

    // Target doanh thu (sheet "KPI") cho các tháng phủ trong khoảng đang lọc.
    const targetB2C = targetFor("B2C", filters.from, filters.to);
    // Target số học sinh/khách tham gia (dòng LoaiSanPham = "HỌC SINH", PhanLoai = "B2C" trong sheet KPI).
    const targetStudentsB2C = targetFor("B2C", filters.from, filters.to, "students");

    const ordersByPhone = new Map<string, Set<string>>();
    for (const r of withPhone) {
      const set = ordersByPhone.get(r.phone as string) ?? new Set<string>();
      set.add(r.orderCode);
      ordersByPhone.set(r.phone as string, set);
    }
    const repeat = Array.from(ordersByPhone.values()).filter((s) => s.size > 1).length;
    const repeatRate = customers > 0 ? (repeat / customers) * 100 : null;

    const categories = Array.from(new Set(rows.map((r) => r.category)));
    const buckets = sortBuckets(
      Array.from(new Set(rows.map((r) => bucketOf(r.date, filters.timeUnit)))),
      filters.timeUnit,
    );
    const fullRows = filterB2C(withFullPeriod(filters));
    const makeStack = (value: (r: B2CRow) => number) => {
      const base = buckets.map((b) => {
        const entry: Record<string, number | string> = {
          bucket: b,
          name: bucketLabel(b, filters.timeUnit),
        };
        let total = 0;
        for (const c of categories) {
          const v = rows
            .filter((r) => bucketOf(r.date, filters.timeUnit) === b && r.category === c)
            .reduce((s, r) => s + value(r), 0);
          entry[c] = v;
          total += v;
        }
        entry["total"] = total;
        return entry as Record<string, number | string> & { bucket: string; total: number };
      });
      const fullMap = groupSum(fullRows, (r) => bucketOf(r.date, filters.timeUnit), value);
      return attachCompare(base, (r) => r.total, filters.timeUnit, compare, fullMap);
    };

    // Target (chia đều theo ngày) cho đúng bucket — chỉ gắn vào revTimeline (chart doanh thu),
    // vẽ thành đường trên chart cùng trục với cột để so trực quan.
    const revTimeline = makeStack((r) => r.revenue).map((row) => ({
      ...row,
      target: targetForBucket("B2C", row.bucket, filters.timeUnit),
    }));
    const qtyTimeline = makeStack((r) => r.quantity);

    const bySource = toSortedPairs(groupSum(rows, (r) => r.source, (r) => r.revenue));
    const byCategory = toSortedPairs(groupSum(rows, (r) => r.category, (r) => r.revenue));
    const qtyCatMap = groupSum(rows, (r) => r.category, (r) => r.quantity);
    const byCategoryQty = byCategory.map((c) => ({ name: c.name, value: qtyCatMap.get(c.name) ?? 0 }));

    const ordersPerCategory = new Map<string, Set<string>>();
    for (const r of rows) {
      const set = ordersPerCategory.get(r.category) ?? new Set<string>();
      set.add(r.orderCode);
      ordersPerCategory.set(r.category, set);
    }
    const aovByCategory = byCategory.map((c) => ({
      name: c.name,
      value: c.value / Math.max(1, ordersPerCategory.get(c.name)?.size ?? 1),
    }));

    // Top khách hàng: chỉ theo SĐT, loại SĐT trùng nhân viên tạo đơn
    const customerMap = new Map<string, { name: string; phone: string; value: number; quantity: number; lastDate: string; orders: Set<string> }>();
    for (const r of withPhone) {
      if (r.isStaffPhone) continue;
      const phone = r.phone as string;
      const cur = customerMap.get(phone) ?? {
        name: maskCustomerName(r.customerName, phone),
        phone,
        value: 0,
        quantity: 0,
        lastDate: r.date,
        orders: new Set<string>(),
      };
      cur.value += r.revenue;
      cur.quantity += r.quantity;
      if (r.date > cur.lastDate) cur.lastDate = r.date;
      cur.orders.add(r.orderCode);
      customerMap.set(phone, cur);
    }
    const allCustomers = Array.from(customerMap.values()).map((c) => ({ ...c, orderCount: c.orders.size }));
    const topCustomers = allCustomers
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    // Khách hàng theo thời gian: MỚI (kỳ này là lần đầu mua) vs QUAY LẠI (đã mua ở kỳ trước).
    // Kỳ mà 1 SĐT xuất hiện lần đầu -> "Mua một lần"; các kỳ sau khi họ mua lại -> "Mua nhiều lần".
    const bucketIndex = new Map(buckets.map((b, i) => [b, i] as const));
    const firstIdxByPhone = new Map<string, number>();
    for (const r of withPhone) {
      const idx = bucketIndex.get(bucketOf(r.date, filters.timeUnit));
      if (idx === undefined) continue;
      const cur = firstIdxByPhone.get(r.phone as string);
      if (cur === undefined || idx < cur) firstIdxByPhone.set(r.phone as string, idx);
    }
    const customerTimeline = buckets.map((b, bi) => {
      const phones = new Set(
        withPhone.filter((r) => bucketOf(r.date, filters.timeUnit) === b).map((r) => r.phone as string),
      );
      let once = 0;
      let many = 0;
      for (const p of phones) firstIdxByPhone.get(p) === bi ? (once += 1) : (many += 1);
      return { bucket: b, name: bucketLabel(b, filters.timeUnit), "Mua một lần": once, "Mua nhiều lần": many, total: once + many };
    });

    // Cơ cấu khách theo số lần mua trong kỳ: 1 đơn / 2 đơn / 3+ đơn (theo tập chưa lọc freq)
    let freq1 = 0;
    let freq2 = 0;
    let freq3 = 0;
    for (const s of ordersByPhoneBase.values()) {
      if (s.size >= 3) freq3 += 1;
      else if (s.size === 2) freq2 += 1;
      else freq1 += 1;
    }
    const purchaseFreq = [
      { name: "Mua 1 đơn", value: freq1 },
      { name: "Mua 2 đơn", value: freq2 },
      { name: "Mua 3+ đơn", value: freq3 },
    ];
    const purchaseFreqTotal = freq1 + freq2 + freq3;

    // Doanh thu khách mới vs khách quay lại theo thời gian
    // (đơn đầu tiên của mỗi khách trong kỳ lọc = khách mới; các đơn sau = quay lại)
    const orderInfo = new Map<string, { phone: string; date: string; revenue: number }>();
    for (const r of withPhone) {
      const cur = orderInfo.get(r.orderCode) ?? { phone: r.phone as string, date: r.date, revenue: 0 };
      cur.revenue += r.revenue;
      if (r.date && (!cur.date || r.date < cur.date)) cur.date = r.date;
      orderInfo.set(r.orderCode, cur);
    }
    const ordersArr = Array.from(orderInfo.entries());
    const ordersByPhoneList = new Map<string, { code: string; date: string }[]>();
    for (const [code, info] of ordersArr) {
      const arr = ordersByPhoneList.get(info.phone) ?? [];
      arr.push({ code, date: info.date });
      ordersByPhoneList.set(info.phone, arr);
    }
    const firstOrderByPhone = new Map<string, string>();
    for (const [phone, arr] of ordersByPhoneList) {
      arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1));
      firstOrderByPhone.set(phone, arr[0]!.code);
    }

    /* Cơ cấu khách hàng theo đơn hàng (nested donut): vòng ngoài Không có SĐT/Có SĐT, vòng trong
     * (chỉ trong "Có SĐT") Khách mới (mua một lần)/Khách quay lại — cùng rule new/return với các
     * chart khác (dựa vào firstOrderByPhone toàn kỳ đang lọc). */
    let ordersNew = 0;
    let ordersReturn = 0;
    for (const [code, info] of ordersArr) {
      if (firstOrderByPhone.get(info.phone) === code) ordersNew += 1;
      else ordersReturn += 1;
    }
    const ordersNoPhone = new Set(rows.filter((r) => !r.phone).map((r) => r.orderCode)).size;
    const customerCompositionOuter = [
      { name: "Khách có SĐT", value: ordersNew + ordersReturn },
      { name: "Không có SĐT", value: ordersNoPhone },
    ];
    const customerCompositionInner = [
      { name: "Khách mới (mua một lần)", value: ordersNew },
      { name: "Khách quay lại (mua nhiều lần)", value: ordersReturn },
    ];

    const newVsReturn = buckets.map((b) => {
      let rNew = 0;
      let rRet = 0;
      for (const [code, info] of ordersArr) {
        if (bucketOf(info.date, filters.timeUnit) !== b) continue;
        if (firstOrderByPhone.get(info.phone) === code) rNew += info.revenue;
        else rRet += info.revenue;
      }
      return {
        bucket: b,
        name: bucketLabel(b, filters.timeUnit),
        "Khách mới": rNew,
        "Khách quay lại": rRet,
        total: rNew + rRet,
      };
    });

    // Matrix Tháng x Thứ
    const months = sortBuckets(Array.from(new Set(rows.map((r) => bucketOf(r.date, "month")))), "month");
    const matrix = months.map((m) => {
      const cells = WEEKDAY_ORDER.map((wd) => ({
        weekday: wd,
        value: rows
          .filter((r) => bucketOf(r.date, "month") === m && bucketOf(r.date, "weekday") === wd)
          .reduce((s, r) => s + r.revenue, 0),
      }));
      return { month: bucketLabel(m, "month"), monthKey: m, cells, total: cells.reduce((s, c) => s + c.value, 0) };
    });
    const matrixMax = Math.max(1, ...matrix.flatMap((m) => m.cells.map((c) => c.value)));

    // Ma trận 3 cấp: Tháng → Tuần (trong tháng) → Thứ. Tuần trong tháng = ceil(ngày/7).
    const womOf = (dateStr: string) => {
      const day = Number((dateStr.split("-")[2] ?? "1"));
      return Math.floor((day - 1) / 7) + 1;
    };
    const monthWeekMatrix = months.map((mk) => {
      const mrows = rows.filter((r) => bucketOf(r.date, "month") === mk);
      const weekNums = Array.from(new Set(mrows.map((r) => womOf(r.date)))).sort((a, b) => a - b);
      const weeks = weekNums.map((wn) => {
        const cells = WEEKDAY_ORDER.map((wd) => ({
          weekday: wd,
          value: mrows
            .filter((r) => womOf(r.date) === wn && bucketOf(r.date, "weekday") === wd)
            .reduce((s, r) => s + r.revenue, 0),
        }));
        return { weekLabel: `Tuần ${wn}`, cells, total: cells.reduce((s, c) => s + c.value, 0) };
      });
      const monthCells = WEEKDAY_ORDER.map((wd) => ({
        weekday: wd,
        value: mrows
          .filter((r) => bucketOf(r.date, "weekday") === wd)
          .reduce((s, r) => s + r.revenue, 0),
      }));
      return {
        monthKey: mk,
        month: bucketLabel(mk, "month"),
        weeks,
        monthCells,
        total: mrows.reduce((s, r) => s + r.revenue, 0),
      };
    });
    const monthWeekMax = Math.max(
      1,
      ...monthWeekMatrix.flatMap((m) => m.weeks.flatMap((w) => w.cells.map((c) => c.value))),
      ...monthWeekMatrix.flatMap((m) => m.monthCells.map((c) => c.value)),
    );

    // Bảng chi tiết: sắp xếp theo NGÀY GIAO DỊCH giảm dần (gần hôm nay nhất ở trên)
    const detail = [...rows].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    const topSource = bySource[0];
    const topCat = byCategory[0];
    const insights = [
      topCat && revenue > 0
        ? `Nhóm "${topCat.name}" dẫn đầu doanh thu B2C với ${formatCurrency(topCat.value)} (${formatPercent((topCat.value / revenue) * 100)}).`
        : null,
      topSource && revenue > 0
        ? `Nguồn đơn hàng "${topSource.name}" chiếm ${formatPercent((topSource.value / revenue) * 100)} doanh thu.`
        : null,
      repeatRate !== null
        ? `Tỷ lệ khách quay lại đạt ${formatPercent(repeatRate)} trên ${formatNumber(customers)} khách có SĐT.`
        : null,
      (() => {
        const retRev = newVsReturn.reduce((s, r) => s + Number(r["Khách quay lại"] ?? 0), 0);
        const allRev = newVsReturn.reduce((s, r) => s + Number(r["total"] ?? 0), 0);
        return allRev > 0
          ? `Khách quay lại đóng góp ${formatPercent((retRev / allRev) * 100)} doanh thu B2C (khách có SĐT).`
          : null;
      })(),
    ].filter((x): x is string => Boolean(x));

    /* ---------------------------------------------------------------- */
    /* Giá trị khách hàng: DT/khách (chỉ đơn có SĐT)                     */
    /* ---------------------------------------------------------------- */
    const revenueWithPhone = withPhone.reduce((s, r) => s + r.revenue, 0);
    const revenuePerCustomer = customers > 0 ? revenueWithPhone / customers : null;

    /* ---------------------------------------------------------------- */
    /* Đơn chưa có thông tin KH (không có SĐT)                           */
    /* ---------------------------------------------------------------- */
    const noPhoneRows = rows.filter((r) => !r.phone);
    const noPhoneOrders = new Set(noPhoneRows.map((r) => r.orderCode)).size;
    const noPhoneRevenue = noPhoneRows.reduce((s, r) => s + r.revenue, 0);
    const noPhoneOrderShare = orders > 0 ? (noPhoneOrders / orders) * 100 : null;

    /* Số lượng đơn không SĐT theo thời gian, chia theo Danh mục sản phẩm (tooltip kèm doanh thu). */
    const noPhoneByCatBucket = new Map<
      string,
      { byCategory: Map<string, { orders: Set<string>; revenue: number }>; orders: Set<string>; revenue: number }
    >();
    for (const r of noPhoneRows) {
      const b = bucketOf(r.date, filters.timeUnit);
      let cell = noPhoneByCatBucket.get(b);
      if (!cell) {
        cell = { byCategory: new Map(), orders: new Set(), revenue: 0 };
        noPhoneByCatBucket.set(b, cell);
      }
      cell.orders.add(r.orderCode);
      cell.revenue += r.revenue;
      let catCell = cell.byCategory.get(r.category);
      if (!catCell) {
        catCell = { orders: new Set(), revenue: 0 };
        cell.byCategory.set(r.category, catCell);
      }
      catCell.orders.add(r.orderCode);
      catCell.revenue += r.revenue;
    }
    const noPhoneByCategoryTimeline = buckets.map((b) => {
      const cell = noPhoneByCatBucket.get(b);
      const entry: Record<string, number | string> = { bucket: b, name: bucketLabel(b, filters.timeUnit) };
      for (const c of categories) {
        entry[c] = cell?.byCategory.get(c)?.orders.size ?? 0;
        entry[`rev__${c}`] = cell?.byCategory.get(c)?.revenue ?? 0;
      }
      entry.total = cell?.orders.size ?? 0;
      entry.revenueTotal = cell?.revenue ?? 0;
      return entry;
    });

    /* Số lượng đơn không SĐT theo Nhân viên (top 10 + "NV khác") — bar ngang, 1 lượt duyệt. */
    const noPhoneByStaffAll = new Map<string, Set<string>>();
    for (const r of noPhoneRows) {
      const key = r.assignedStaff ?? "Chưa gán NV";
      const set = noPhoneByStaffAll.get(key) ?? new Set<string>();
      set.add(r.orderCode);
      noPhoneByStaffAll.set(key, set);
    }
    const noPhoneStaffRankAll = Array.from(noPhoneByStaffAll.entries())
      .map(([name, set]) => ({ name, value: set.size }))
      .sort((a, b) => b.value - a.value);
    const top10NoPhoneStaff = noPhoneStaffRankAll.slice(0, 10);
    const restNoPhoneStaff = noPhoneStaffRankAll.slice(10).reduce((s, x) => s + x.value, 0);
    const noPhoneByStaffChart = [
      ...top10NoPhoneStaff,
      ...(restNoPhoneStaff > 0 ? [{ name: "Nhân viên khác", value: restNoPhoneStaff }] : []),
    ].map((x) => ({ ...x, share: noPhoneOrders ? (x.value / noPhoneOrders) * 100 : 0 }));

    /* ---------------------------------------------------------------- */
    /* Nhân viên phụ trách: doanh thu × danh mục, top 5 + "Nhân viên khác" */
    /* ---------------------------------------------------------------- */
    const staffRows = rows.filter((r) => r.assignedStaff);
    const staffRevRank = toSortedPairs(groupSum(staffRows, (r) => r.assignedStaff as string, (r) => r.revenue));
    const top5Staff = staffRevRank.slice(0, 5).map((s) => s.name);
    const staffGroupOf = (name: string) => (top5Staff.includes(name) ? name : "Nhân viên khác");
    const staffOrderNames = staffRevRank.length > 5 ? [...top5Staff, "Nhân viên khác"] : top5Staff;
    // 1 lượt duyệt qua staffRows: nhóm -> danh mục -> doanh thu (tránh lặp lồng theo từng nhân viên/danh mục).
    type StaffCell = { byCategory: Map<string, number>; total: number; customers: Set<string>; products: number; orders: Set<string> };
    const staffAgg = new Map<string, StaffCell>();
    for (const r of staffRows) {
      const g = staffGroupOf(r.assignedStaff as string);
      let cell = staffAgg.get(g);
      if (!cell) {
        cell = { byCategory: new Map(), total: 0, customers: new Set(), products: 0, orders: new Set() };
        staffAgg.set(g, cell);
      }
      cell.byCategory.set(r.category, (cell.byCategory.get(r.category) ?? 0) + r.revenue);
      cell.total += r.revenue;
      cell.products += r.quantity;
      cell.orders.add(r.orderCode);
      if (r.phone) cell.customers.add(r.phone);
    }
    const staffChart = staffOrderNames
      .map((name) => {
        const cell = staffAgg.get(name);
        const entry: Record<string, number | string | null> = { name };
        for (const c of categories) entry[c] = cell?.byCategory.get(c) ?? 0;
        entry.total = cell?.total ?? 0;
        entry.customerCount = cell?.customers.size ?? 0;
        entry.productCount = cell?.products ?? 0;
        entry.orderCount = cell?.orders.size ?? 0;
        // Target doanh thu theo NHÂN VIÊN theo tháng: chưa có nguồn dữ liệu (sheet KPI hiện chỉ có
        // target theo B2C/B2B toàn công ty) -> để null, KHÔNG suy diễn (đường target sẽ không vẽ).
        entry.target = null;
        return entry;
      })
      .filter((e) => (e.total as number) > 0);

    /* ---------------------------------------------------------------- */
    /* Khuyến mãi (CTKM) — theo cột "MaKhuyenMai" + "Số tiền KM"          */
    /* ---------------------------------------------------------------- */
    const promoRows = rows.filter((r) => r.promoCode);
    const promoRunning = new Set(promoRows.map((r) => r.promoCode)).size;
    const promoApplied = promoRows.length; // 1 dòng = 1 đơn (đã gộp theo Mã đơn hàng)
    const promoCost = promoRows.reduce((s, r) => s + r.discount, 0);
    const promoRevenue = promoRows.reduce((s, r) => s + r.revenue, 0);

    type PromoAgg = {
      orders: Set<string>;
      cost: number;
      revenue: number;
      newCustomers: number;
      returningCustomers: number;
      unknownCustomers: number;
      from: string;
      to: string;
    };
    const promoAgg = new Map<string, PromoAgg>();
    for (const r of promoRows) {
      const key = r.promoCode as string;
      const cur =
        promoAgg.get(key) ??
        { orders: new Set<string>(), cost: 0, revenue: 0, newCustomers: 0, returningCustomers: 0, unknownCustomers: 0, from: r.date, to: r.date };
      cur.orders.add(r.orderCode);
      cur.cost += r.discount;
      cur.revenue += r.revenue;
      if (!r.phone) cur.unknownCustomers += 1;
      else if (firstOrderByPhone.get(r.phone) === r.orderCode) cur.newCustomers += 1;
      else cur.returningCustomers += 1;
      if (r.date && r.date < cur.from) cur.from = r.date;
      if (r.date && r.date > cur.to) cur.to = r.date;
      promoAgg.set(key, cur);
    }
    const promoList = Array.from(promoAgg.entries())
      .map(([name, v]) => ({
        name,
        value: v.revenue,
        orders: v.orders.size,
        cost: v.cost,
        newCustomers: v.newCustomers,
        returningCustomers: v.returningCustomers,
        unknownCustomers: v.unknownCustomers,
        from: v.from,
        to: v.to,
        share: promoRevenue ? (v.revenue / promoRevenue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);
    const top10Promo = promoList.slice(0, 10);
    const top10PromoByUsage = [...promoList].sort((a, b) => b.orders - a.orders).slice(0, 10);

    const promoTimeline = (() => {
      const byBucket = new Map<string, { byCategory: Map<string, number>; total: number }>();
      for (const r of promoRows) {
        const b = bucketOf(r.date, filters.timeUnit);
        let cell = byBucket.get(b);
        if (!cell) {
          cell = { byCategory: new Map(), total: 0 };
          byBucket.set(b, cell);
        }
        cell.byCategory.set(r.category, (cell.byCategory.get(r.category) ?? 0) + r.revenue);
        cell.total += r.revenue;
      }
      return buckets.map((b) => {
        const cell = byBucket.get(b);
        const entry: Record<string, number | string> = { bucket: b, name: bucketLabel(b, filters.timeUnit) };
        for (const c of categories) entry[c] = cell?.byCategory.get(c) ?? 0;
        entry.total = cell?.total ?? 0;
        return entry;
      });
    })();

    /* DT trước KM / DT sau KM / Chi phí KM theo thời gian — bù trừ: DT trước KM = DT sau KM + Chi phí KM. */
    const promoAreaTimeline = (() => {
      const byBucket = new Map<string, { sau: number; chiPhi: number }>();
      for (const r of promoRows) {
        const b = bucketOf(r.date, filters.timeUnit);
        const cell = byBucket.get(b) ?? { sau: 0, chiPhi: 0 };
        cell.sau += r.revenue;
        cell.chiPhi += r.discount;
        byBucket.set(b, cell);
      }
      return buckets.map((b) => {
        const cell = byBucket.get(b) ?? { sau: 0, chiPhi: 0 };
        return {
          bucket: b,
          name: bucketLabel(b, filters.timeUnit),
          "DT sau KM": cell.sau,
          "Chi phí KM": cell.chiPhi,
          "DT trước KM": cell.sau + cell.chiPhi,
        };
      });
    })();

    return {
      rows,
      revenue,
      quantity,
      discount,
      orders,
      customers,
      aov,
      targetB2C,
      targetStudentsB2C,
      repeatRate,
      categories,
      buckets,
      firstOrderByPhone,
      top5Staff,
      staffGroupOf,
      revTimeline,
      qtyTimeline,
      bySource,
      byCategory,
      byCategoryQty,
      aovByCategory,
      topCustomers,
      allCustomers,
      customerCompositionOuter,
      customerCompositionInner,
      customerTimeline,
      purchaseFreq,
      purchaseFreqTotal,
      newVsReturn,
      matrix,
      matrixMax,
      monthWeekMatrix,
      monthWeekMax,
      detail,
      insights,
      revenuePerCustomer,
      noPhoneOrders,
      noPhoneRevenue,
      noPhoneOrderShare,
      noPhoneByCategoryTimeline,
      noPhoneByStaffChart,
      staffChart,
      promoRunning,
      promoApplied,
      promoCost,
      promoRevenue,
      top10Promo,
      top10PromoByUsage,
      promoList,
      promoTimeline,
      promoAreaTimeline,
    };
  }, [filters, sel, compare]);

  const stackColors = (i: number) => DONUT_COLORS[i % DONUT_COLORS.length] as string;
  // Bảng chi tiết ở dashboard: rút gọn cột cần thiết; Chi nhánh + Nhân viên đưa xuống cuối.
  // (Dữ liệu đầy đủ đã có ở chế độ "Dạng bảng" / xuất CSV.)
  const columns: Column<B2CRow>[] = [
    { key: "date", header: "Ngày giao dịch", render: (r) => (r.date ? toDMY(r.date) : "—") },
    { key: "customer", header: "Tên khách hàng", render: (r) => maskCustomerName(r.customerName, r.phone) },
    { key: "phone", header: "SĐT khách hàng", render: (r) => r.phone ?? "—" },
    { key: "order", header: "Mã đơn hàng", render: (r) => r.orderCode },
    { key: "source", header: "Nguồn đơn hàng", render: (r) => r.source },
    { key: "product", header: "Tên sản phẩm", render: (r) => r.productName },
    { key: "productGroup", header: "Danh mục sản phẩm", render: (r) => r.productGroup },
    { key: "qty", header: "Số lượng", render: (r) => formatNumber(r.quantity), align: "right" },
    { key: "revenue", header: "Tổng doanh thu (đ)", render: (r) => formatNumber(r.revenue), align: "right" },
    { key: "staff", header: "Nhân viên tạo đơn", render: (r) => r.staffName ?? "—" },
    { key: "assignedStaff", header: "Nhân viên phụ trách", render: (r) => r.assignedStaff ?? "—" },
    { key: "promo", header: "CTKM", render: (r) => r.promoCode ?? "—" },
    { key: "branch", header: "Tên chi nhánh", render: (r) => r.branch },
  ];

  const selectedCustomer = data.topCustomers.find((c) => c.phone === selectedPhone);

  return (
    <DashboardShell
      title="B2C - Khách lẻ"
      description="Bán hàng lẻ đang diễn ra thế nào: doanh thu, sản phẩm, nguồn đơn và hành vi khách hàng."
      tableView={<DataTableView columns={columns} rows={data.detail} fileName="b2c-chi-tiet-san-pham" />}
    >
      <FilterBar
        filters={filters}
        onChange={setFilters}
        show={{ model: false, branch: true, category: true, source: true }}
        branchList={b2cBranchOptions}
        crossFilters={chips}
        onRemoveCrossFilter={clear}
        onClearCrossFilter={clearAll}
      />


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Doanh thu B2C"
          numeric={data.revenue}
          format={formatCurrency}
          change={null}
          icon={<Wallet className="size-4" />}
          subMetrics={[targetSubMetric(data.revenue, data.targetB2C)]}
        />
        <KpiCard
          label="Khách hàng (có SĐT)"
          numeric={data.customers}
          format={(n) => formatNumber(Math.round(n))}
          unit="khách"
          change={null}
          subtitle={"\n"}
          icon={<Users className="size-4" />}
          subMetrics={[
            targetSubMetric(data.customers, data.targetStudentsB2C, (n) => `${formatNumber(Math.round(n))} khách`),
          ]}
        />
        <KpiCard
          label="Số sản phẩm"
          numeric={data.quantity}
          format={(n) => formatNumber(Math.round(n))}
          unit="sản phẩm"
          change={null}
          icon={<Package className="size-4" />}
        />
        <KpiCard
          label="Giá trị trung bình/ đơn hàng"
          {...(data.aov === null ? { unavailable: true } : { numeric: data.aov, format: formatCurrency })}
          change={null}
          subtitle={`${formatNumber(data.orders)} đơn hàng`}
          icon={<Wallet className="size-4" />}
        />
        <KpiCard
          label="Tỷ lệ khách quay lại"
          {...(data.repeatRate === null
            ? { unavailable: true }
            : { numeric: data.repeatRate, format: (n: number) => formatPercent(n) })}
          change={null}
          subtitle="Khách có ≥ 2 đơn / khách có SĐT"
          icon={<Repeat className="size-4" />}
        />
      </div>

      <Panel title="🚩 Chỉ số nổi bật" isEmpty={data.insights.length === 0}>
        <InsightList items={data.insights} />
      </Panel>

      <SectionHeader title="Doanh thu & sản phẩm" subtitle="Xu hướng doanh thu, sản lượng và cơ cấu theo nguồn/danh mục" />

      <div className="grid gap-4 xl:grid-cols-3">
        <BreakdownTimelineChart
          title="Doanh thu B2C theo thời gian"
          subtitle="Toggle đổi cách phân rã (breakdown) — metric luôn là Doanh thu"
          code="CH-B2C-01"
          unit="đ"
          valueFn={(r) => r.revenue}
          rows={data.rows}
          buckets={data.buckets}
          timeUnit={filters.timeUnit}
          categories={data.categories}
          top5Staff={data.top5Staff}
          staffGroupOf={data.staffGroupOf}
          firstOrderByPhone={data.firstOrderByPhone}
          toggle={toggle}
          targetOf={(b) => targetForBucket("B2C", b, filters.timeUnit)}
        />
        <BreakdownTimelineChart
          title="Số lượng sản phẩm theo thời gian"
          subtitle="Toggle đổi cách phân rã (breakdown) — metric luôn là Số lượng sản phẩm"
          code="CH-B2C-02"
          unit="sản phẩm"
          valueFn={(r) => r.quantity}
          rows={data.rows}
          buckets={data.buckets}
          timeUnit={filters.timeUnit}
          categories={data.categories}
          top5Staff={data.top5Staff}
          staffGroupOf={data.staffGroupOf}
          firstOrderByPhone={data.firstOrderByPhone}
          toggle={toggle}
        />
        <BreakdownTimelineChart
          title="Số lượng đơn hàng theo thời gian"
          subtitle="Toggle đổi cách phân rã (breakdown) — metric luôn là Số lượng đơn hàng"
          code="CH-B2C-02B"
          unit="đơn"
          valueFn={() => 1}
          rows={data.rows}
          buckets={data.buckets}
          timeUnit={filters.timeUnit}
          categories={data.categories}
          top5Staff={data.top5Staff}
          staffGroupOf={data.staffGroupOf}
          firstOrderByPhone={data.firstOrderByPhone}
          toggle={toggle}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Doanh thu theo Danh mục sản phẩm" code="CH-B2C-04" isEmpty={data.byCategory.length === 0}>
          <SimpleBar
            rows={data.byCategory}
            unit="đ"
            total={data.revenue}
            selected={sel["category"]}
            onSelect={(name) => toggle("category", name)}
            color={categoryColor}
          />
        </Panel>

        <Panel title="Số lượng theo Danh mục sản phẩm" code="CH-B2C-05" isEmpty={data.byCategoryQty.length === 0}>
          <SimpleBar
            rows={data.byCategoryQty}
            unit="sản phẩm"
            total={data.quantity}
            selected={sel["category"]}
            onSelect={(name) => toggle("category", name)}
            color={categoryColor}
          />
        </Panel>

        <Panel
          title="Doanh thu & Số lượng theo Nhân viên phụ trách"
          subtitle="Cột = Doanh thu, đường = Số lượng (SP/Đơn hàng theo toggle). Top 5 + Nhân viên khác."
          code="CH-B2C-14"
          isEmpty={data.staffChart.length === 0}
        >
          <StaffRevenueQtyChart staffChart={data.staffChart} sel={sel} toggle={toggle} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Cơ cấu khách hàng theo đơn hàng"
          subtitle="Vòng ngoài: Có SĐT/Không có SĐT · Vòng trong: trong nhóm Có SĐT — Khách mới/Khách quay lại"
          code="CH-B2C-17"
          isEmpty={data.orders === 0}
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data.customerCompositionOuter}
                dataKey="value"
                nameKey="name"
                innerRadius="70%"
                outerRadius="88%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                cursor="pointer"
                onClick={(d: { name?: string }) => d?.name === "Không có SĐT" && toggle("customer", "Không có SĐT")}
              >
                {data.customerCompositionOuter.map((d, i) => (
                  <Cell key={d.name} fill={i === 0 ? CHART_COLORS.primary : CHART_COLORS.axis} />
                ))}
              </Pie>
              <Pie
                data={data.customerCompositionInner}
                dataKey="value"
                nameKey="name"
                innerRadius="40%"
                outerRadius="65%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                label={renderInsideLabel}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("customer", d?.name?.startsWith("Khách mới") ? "Khách mua một lần" : "Khách quay lại")}
              >
                {data.customerCompositionInner.map((d, i) => (
                  <Cell key={d.name} fill={i === 0 ? CHART_COLORS.dark : CHART_COLORS.support} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const value = Number(payload[0]?.value ?? 0);
                  return (
                    <TooltipBox label={String(payload[0]?.name)}>
                      <TooltipRow name="Số đơn" value={value} unit="đơn" share={data.orders ? (value / data.orders) * 100 : undefined} />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-2 grid gap-1">
            {[...data.customerCompositionOuter, ...data.customerCompositionInner].map((r, i) => (
              <li key={r.name} className="flex items-center gap-2 text-xs">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: i < 2 ? (i === 0 ? CHART_COLORS.primary : CHART_COLORS.axis) : i === 2 ? CHART_COLORS.dark : CHART_COLORS.support }} />
                <span className="truncate text-muted-foreground">{r.name}</span>
                <span className="ml-auto shrink-0 font-medium tabular-nums">{formatNumber(r.value)} đơn</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="Cơ cấu khách theo số lần mua"
          subtitle="Khách có SĐT, chia theo số đơn trong kỳ: 1 / 2 / 3+ đơn"
          code="CH-B2C-10"
          isEmpty={data.purchaseFreqTotal === 0}
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data.purchaseFreq}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="80%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                label={renderInsideLabel}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("freq", d?.name)}
              >
                {data.purchaseFreq.map((d, i) => (
                  <Cell key={d.name} fill={cellFill(d.name, sel["freq"], FREQ_COLORS[i % FREQ_COLORS.length]!)} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const value = Number(payload[0]?.value ?? 0);
                  return (
                    <TooltipBox label={String(payload[0]?.name)}>
                      <TooltipRow
                        name="Số khách"
                        value={value}
                        unit="khách"
                        share={data.purchaseFreqTotal ? (value / data.purchaseFreqTotal) * 100 : undefined}
                      />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-2 grid gap-1.5">
            {data.purchaseFreq.map((r, i) => (
              <li
                key={r.name}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 text-xs transition-colors hover:bg-secondary",
                  sel["freq"] && sel["freq"] !== r.name && "opacity-45",
                )}
                onClick={() => toggle("freq", r.name)}
              >
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: FREQ_COLORS[i % FREQ_COLORS.length] }} />
                <span className="truncate text-muted-foreground">{r.name}</span>
                <span className="ml-auto shrink-0 font-medium tabular-nums">{formatNumber(r.value)} khách</span>
                <span className="w-14 shrink-0 text-right text-muted-foreground">
                  {data.purchaseFreqTotal ? formatPercent((r.value / data.purchaseFreqTotal) * 100) : "—"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Doanh thu theo nguồn đơn hàng" code="CH-B2C-03" isEmpty={data.bySource.length === 0}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data.bySource}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="80%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                label={renderInsideLabel}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("source", d?.name)}
              >
                {data.bySource.map((d, i) => (
                  <Cell key={d.name} fill={cellFill(d.name, sel["source"], stackColors(i))} />
                ))}
              </Pie>

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const value = Number(payload[0]?.value ?? 0);
                  return (
                    <TooltipBox label={String(payload[0]?.name)}>
                      <TooltipRow
                        name="Doanh thu"
                        value={value}
                        share={data.revenue ? (value / data.revenue) * 100 : undefined}
                      />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <DonutLegend rows={data.bySource} total={data.revenue} />
        </Panel>
      </div>

      <SectionHeader title="Khách hàng" subtitle="Ai đang mua, giá trị mang lại và những đơn chưa xác định được khách" icon={<Users className="size-4" />} />

      {/* Top 10 khách hàng: tạm ẩn theo yêu cầu, giữ nguyên code để dùng lại sau này. */}
      {false && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Panel
            title="Top 10 khách hàng"
            subtitle="Toggle đổi tiêu chí xếp hạng — bấm vào cột để lọc chéo toàn trang theo khách"
            code="CH-B2C-07"
            isEmpty={data.allCustomers.length === 0}
          >
            <TopCustomersChart customers={data.allCustomers} selectedPhone={selectedPhone} onSelect={(phone) => toggle("phone", phone)} />
          </Panel>
        </div>
      )}

      <SectionHeader
        title="Khuyến mãi"
        subtitle="Hiệu quả từng chương trình khuyến mãi (cột MaKhuyenMai): chi phí bỏ ra và doanh thu mang về"
        icon={<BadgePercent className="size-4" />}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Số CTKM / Mã KM"
          numeric={data.promoRunning}
          format={(n) => formatNumber(Math.round(n))}
          unit="chương trình"
          change={null}
          icon={<BadgePercent className="size-4" />}
        />
        <KpiCard
          label="Doanh thu mang về"
          numeric={data.promoRevenue}
          format={formatCurrency}
          change={null}
          subtitle={data.revenue ? `${formatPercent((data.promoRevenue / data.revenue) * 100)} / ${formatCurrency(data.revenue)} DT tổng` : undefined}
          icon={<Wallet className="size-4" />}
        />
        <KpiCard
          label="Chi phí khuyến mãi"
          numeric={data.promoCost}
          format={formatCurrency}
          change={null}
          subtitle={data.promoRevenue ? `${formatPercent((data.promoCost / data.promoRevenue) * 100)} DT mang về` : undefined}
          icon={<Wallet className="size-4" />}
        />
        <KpiCard
          label="Số lượt sử dụng"
          numeric={data.promoApplied}
          format={(n) => formatNumber(Math.round(n))}
          unit="đơn"
          change={null}
          subtitle={data.orders ? `${formatPercent((data.promoApplied / data.orders) * 100)} / ${formatNumber(data.orders)} đơn tổng` : undefined}
          icon={<BadgePercent className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Doanh thu trước / sau KM & Chi phí KM theo thời gian"
          subtitle="Miền chồng: DT sau KM (đáy) + Chi phí KM (trên) = DT trước KM (mép trên, đúng logic bù trừ)"
          code="CH-B2C-15-AREA"
          isEmpty={data.promoAreaTimeline.every((r) => Number(r["DT trước KM"] ?? 0) === 0)}
        >
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart
              data={data.promoAreaTimeline}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
              onClick={(e: { activePayload?: { payload?: { bucket?: string } }[] }) => toggle("bucket", e?.activePayload?.[0]?.payload?.bucket)}
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} tickFormatter={shortLabel} width={60} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as Record<string, number>;
                  const truoc = Number(row["DT trước KM"] ?? 0);
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow color={CHART_COLORS.dark} name="DT trước KM" value={truoc} />
                      <TooltipRow color={CHART_COLORS.primary} name="DT sau KM" value={Number(row["DT sau KM"] ?? 0)} share={truoc ? (Number(row["DT sau KM"] ?? 0) / truoc) * 100 : undefined} />
                      <TooltipRow color={CHART_COLORS.axis} name="Chi phí KM" value={Number(row["Chi phí KM"] ?? 0)} share={truoc ? (Number(row["Chi phí KM"] ?? 0) / truoc) * 100 : undefined} />
                    </TooltipBox>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="DT sau KM" stackId="a" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.55} />
              <Area type="monotone" dataKey="Chi phí KM" stackId="a" stroke={CHART_COLORS.axis} fill={CHART_COLORS.axis} fillOpacity={0.4} />
              <Line type="monotone" dataKey="DT trước KM" stroke={CHART_COLORS.dark} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Cơ cấu doanh thu theo đơn có CTKM / không có CTKM"
          code="CH-B2C-15"
          isEmpty={data.revenue === 0}
        >
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={[
                  { name: "Có CTKM", value: data.promoRevenue },
                  { name: "Không có CTKM", value: Math.max(0, data.revenue - data.promoRevenue) },
                ]}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="80%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                label={renderInsideLabel}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("promoStatus", d?.name)}
              >
                <Cell fill={cellFill("Có CTKM", sel["promoStatus"], CHART_COLORS.primary)} />
                <Cell fill={cellFill("Không có CTKM", sel["promoStatus"], CHART_COLORS.axis)} />
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const value = Number(payload[0]?.value ?? 0);
                  return (
                    <TooltipBox label={String(payload[0]?.name)}>
                      <TooltipRow name="Doanh thu" value={value} share={data.revenue ? (value / data.revenue) * 100 : undefined} />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <DonutLegend
            rows={[
              { name: "Có CTKM", value: data.promoRevenue },
              { name: "Không có CTKM", value: Math.max(0, data.revenue - data.promoRevenue) },
            ]}
            total={data.revenue}
          />
        </Panel>

        <Panel
          title="Doanh thu trước / sau KM theo chương trình"
          subtitle="Đầu trên = DT trước KM, đầu dưới = DT sau KM; nhãn giữa cột = Tiền KM. Click một CTKM để lọc chéo bảng bên dưới."
          code="CH-B2C-17-DB"
          isEmpty={data.promoList.length === 0}
        >
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(560, data.promoList.length * 90) }}>
              <ResponsiveContainer width="100%" height={360}>
                <ComposedChart
                  data={data.promoList.map((p) => ({ ...p, before: p.value + p.cost, rangeSize: p.cost }))}
                  margin={{ top: 24, right: 16, left: 0, bottom: 16 }}
                  onClick={(e: { activeLabel?: string }) => e?.activeLabel && toggle("promo", e.activeLabel)}
                  style={{ cursor: "pointer" }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="name" {...axisProps} height={44} tick={XCategoryTick} interval={0} />
                  <YAxis {...axisProps} tickFormatter={shortLabel} width={60} />
                  <Tooltip
                    cursor={{ fill: "var(--secondary)" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const row = payload[0]?.payload as { name: string; before: number; value: number; cost: number };
                      const pct = row.before ? (row.cost / row.before) * 100 : 0;
                      return (
                        <TooltipBox label={row.name}>
                          <TooltipRow name="DT trước KM" value={row.before} />
                          <TooltipRow name="DT sau KM" value={row.value} />
                          <TooltipRow name="Tiền KM" value={row.cost} />
                          <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">{formatPercent(pct)} giảm</p>
                        </TooltipBox>
                      );
                    }}
                  />
                  <Bar dataKey="value" stackId="db" fill="transparent" isAnimationActive={false} />
                  <Bar dataKey="rangeSize" stackId="db" barSize={4} fill={CHART_COLORS.axis} isAnimationActive={false}>
                    <LabelList dataKey="rangeSize" position="center" formatter={(v: number) => shortLabel(v)} style={{ fontSize: 9, fill: CHART_COLORS.axis }} />
                  </Bar>
                  <Scatter
                    dataKey="before"
                    fill={CHART_COLORS.dark}
                    shape={(props: { cx?: number; cy?: number; payload?: { name?: string } }) => {
                      const isDim = Boolean(sel["promo"]) && sel["promo"] !== props.payload?.name;
                      return <circle cx={props.cx} cy={props.cy} r={5} fill={CHART_COLORS.dark} opacity={isDim ? 0.3 : 1} />;
                    }}
                  >
                    <LabelList dataKey="before" position="top" formatter={(v: number) => shortLabel(v)} style={{ fontSize: 10, fill: CHART_COLORS.dark, fontWeight: 600 }} />
                  </Scatter>
                  <Scatter
                    dataKey="value"
                    fill={CHART_COLORS.primary}
                    shape={(props: { cx?: number; cy?: number; payload?: { name?: string } }) => {
                      const isDim = Boolean(sel["promo"]) && sel["promo"] !== props.payload?.name;
                      return <circle cx={props.cx} cy={props.cy} r={5} fill={CHART_COLORS.primary} opacity={isDim ? 0.3 : 1} />;
                    }}
                  >
                    <LabelList dataKey="value" position="bottom" formatter={(v: number) => shortLabel(v)} style={{ fontSize: 10, fill: CHART_COLORS.primary, fontWeight: 600 }} />
                  </Scatter>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <p className="mt-1 flex gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: CHART_COLORS.dark }} /> DT trước KM</span>
            <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full" style={{ background: CHART_COLORS.primary }} /> DT sau KM</span>
          </p>
        </Panel>
      </div>


      <Panel title="Hiệu quả chương trình khuyến mãi" subtitle="Bấm 1 dòng hoặc 1 CTKM trên chart để lọc chéo lẫn nhau · bấm tiêu đề cột để sắp xếp" code="CH-B2C-18" isEmpty={data.promoList.length === 0}>
        <PromoTable rows={data.promoList} selected={sel["promo"]} onSelect={(name) => toggle("promo", name)} />
      </Panel>

      <FactTable
        title="Bảng chi tiết sản phẩm bán ra"
        subtitle={
          selectedPhone
            ? `Đang lọc theo khách hàng ${selectedCustomer?.name ?? selectedPhone} (${selectedPhone})`
            : "Chọn cột hiển thị và xuất dữ liệu"
        }
        columns={columns}
        rows={data.detail}
        fileName="b2c-chi-tiet-san-pham"
      />
      <Panel
        title="Cơ cấu doanh thu theo Tháng, Tuần & Thứ"
        subtitle="Bấm vào tháng để bung/gập các tuần trong tháng (Tuần 1 = ngày 1–7, Tuần 2 = 8–14…)"
        code="CH-B2C-12"
        isEmpty={data.monthWeekMatrix.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="px-2 py-1 text-left font-medium">Tháng / Tuần</th>
                {WEEKDAY_ORDER.map((w) => (
                  <th key={w} className="px-2 py-1 text-right font-medium">
                    {w}
                  </th>
                ))}
                <th className="px-2 py-1 text-right font-medium">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {data.monthWeekMatrix.map((m) => {
                const open = openMonths[m.monthKey] ?? false;
                const tint = (v: number) =>
                  v > 0
                    ? `color-mix(in oklab, var(--primary) ${Math.round((v / data.monthWeekMax) * 70) + 8}%, transparent)`
                    : undefined;
                return (
                  <Fragment key={m.monthKey}>
                    <tr
                      className="cursor-pointer border-t border-border/60 font-semibold hover:bg-secondary/60"
                      onClick={() => setOpenMonths((s) => ({ ...s, [m.monthKey]: !open }))}
                    >
                      <td className="px-2 py-1 whitespace-nowrap">
                        <span className="inline-block w-3 text-muted-foreground">{open ? "▾" : "▸"}</span> {m.month}
                      </td>
                      {m.monthCells.map((c) => (
                        <td
                          key={c.weekday}
                          title={`${m.month} · ${c.weekday}: ${formatCurrency(c.value)}`}
                          className="px-2 py-1 text-right tabular-nums"
                          style={{ background: tint(c.value) }}
                        >
                          {c.value > 0 ? formatShort(c.value) : "—"}
                        </td>
                      ))}
                      <td className="px-2 py-1 text-right tabular-nums">{formatShort(m.total)}</td>
                    </tr>
                    {open &&
                      m.weeks.map((w) => (
                        <tr key={`${m.monthKey}-${w.weekLabel}`} className="text-muted-foreground">
                          <td className="px-2 py-1 pl-7 whitespace-nowrap">{w.weekLabel}</td>
                          {w.cells.map((c) => (
                            <td
                              key={c.weekday}
                              title={`${m.month} · ${w.weekLabel} · ${c.weekday}: ${formatCurrency(c.value)}`}
                              className="px-2 py-1 text-right tabular-nums"
                              style={{ background: tint(c.value) }}
                            >
                              {c.value > 0 ? formatShort(c.value) : "—"}
                            </td>
                          ))}
                          <td className="px-2 py-1 text-right font-medium tabular-nums">{formatShort(w.total)}</td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <CustomChartsSection dataset="b2c" />
    </DashboardShell>
  );
}

function SimpleBar({
  rows,
  unit,
  total,
  selected,
  onSelect,
  color,
  target,
  targetFormat,
}: {
  rows: { name: string; value: number }[];
  unit: "đ" | "sản phẩm";
  total?: number;
  selected?: string | null | undefined;
  onSelect?: (name?: string) => void;
  color?: string | ((name: string) => string);
  /** Target tổng của CẢ kỳ đang lọc (không chia theo từng danh mục — sheet KPI không có target
   *  theo danh mục) — hiện trong tooltip khi rê chuột vào cột, so với GIÁ TRỊ CỦA CỘT đó (để biết
   *  danh mục này đang đóng góp bao nhiêu % vào target chung). `undefined` -> không hiện. */
  target?: number | null;
  targetFormat?: (n: number) => string;
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
        <XAxis
          type="number"
          {...axisProps}
          tickFormatter={unit === "đ" ? shortLabel : (v: number) => formatNumber(v)}
        />
        <YAxis
          type="category"
          dataKey="name"
          {...axisProps}
          width={140}
          tickFormatter={(v: string) => (v.length > 22 ? `${v.slice(0, 22)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: "var(--secondary)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const value = Number(payload[0]?.value ?? 0);
            return (
              <TooltipBox label={String(label)}>
                <TooltipRow
                  name={unit === "đ" ? "Giá trị" : "Số lượng"}
                  value={value}
                  unit={unit}
                  share={total ? (value / total) * 100 : undefined}
                />
                {target !== undefined && (
                  <TargetRow actual={value} target={target} format={targetFormat} />
                )}
              </TooltipBox>
            );
          }}
        />
        <Bar
          dataKey="value"
          radius={[0, 4, 4, 0]}
          cursor={onSelect ? "pointer" : undefined}
          onClick={(d: { name?: string }) => onSelect?.(d?.name)}
        >
          {rows.map((d) => {
            const active = typeof color === "function" ? color(d.name) : (color ?? CHART_COLORS.primary);
            return <Cell key={d.name} fill={cellFill(d.name, selected, active)} />;
          })}
          <LabelList
            dataKey="value"
            position="right"
            formatter={(v: number) => (unit === "đ" ? formatShort(v) : formatNumber(v))}
            style={{ fontSize: 10, fill: CHART_COLORS.axis }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

