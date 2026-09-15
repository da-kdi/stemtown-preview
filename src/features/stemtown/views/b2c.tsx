import { Package, Repeat, Users, Wallet } from "lucide-react";
import { CustomChartsSection } from "@/features/stemtown/components/CustomChartsSection";
import { Fragment, useMemo, useState } from "react";
import {
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
  TOTAL_COLOR,
} from "@/features/stemtown/components/chart-kit";
import { FactTable, type Column } from "@/features/stemtown/components/fact-table";
import { DataTableView } from "@/features/stemtown/components/data-table-view";
import { FilterBar } from "@/features/stemtown/components/filters";
import { KpiCard } from "@/features/stemtown/components/kpi";
import { InsightList, Panel } from "@/features/stemtown/components/panel";
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
} from "@/features/stemtown/lib/dashboard-data";
import { formatCurrency, formatNumber, formatPercent, formatShort, maskCustomerName } from "@/features/stemtown/lib/format";
import { CompareRow, CompareToggle } from "@/features/stemtown/components/compare-toggle";
import {
  COMPARE_FULL_LABEL,
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

export function B2CPage() {
  const [filters, setFilters] = useState<Filters>({ ...defaultFilters, model: "b2c" });
  const { sel, toggle, clear, clearAll, chips } = useCrossFilter(CROSS_LABELS);
  const selectedPhone = sel["phone"] ?? null;
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const compare: CompareMode = isCompareValid(filters.timeUnit, compareMode) ? compareMode : "none";
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const data = useMemo(() => {
    const keep = (r: B2CRow) =>
      matchSel(r.category, sel["category"]) &&
      matchSel(r.source, sel["source"]) &&
      matchSel(r.productName, sel["product"]) &&
      matchSel(r.phone, selectedPhone) &&
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
    const rows = selFreq
      ? rowsBase.filter((r) => r.phone && phoneFreqBucket.get(r.phone) === selFreq)
      : rowsBase;

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
    const customerMap = new Map<string, { name: string; phone: string; value: number; orders: Set<string> }>();
    for (const r of withPhone) {
      if (r.isStaffPhone) continue;
      const phone = r.phone as string;
      const cur = customerMap.get(phone) ?? {
        name: maskCustomerName(r.customerName, phone),
        phone,
        value: 0,
        orders: new Set<string>(),
      };
      cur.value += r.revenue;
      cur.orders.add(r.orderCode);
      customerMap.set(phone, cur);
    }
    const topCustomers = Array.from(customerMap.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 10)
      .map((c) => ({ ...c, orderCount: c.orders.size }));

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
      return { month: bucketLabel(m, "month"), cells, total: cells.reduce((s, c) => s + c.value, 0) };
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
      revTimeline,
      qtyTimeline,
      bySource,
      byCategory,
      byCategoryQty,
      aovByCategory,
      topCustomers,
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

      <div className="grid gap-4 xl:grid-cols-2">
        {[
          { title: "Doanh thu B2C theo thời gian", subtitle: "Cột chồng theo nhóm sản phẩm, đường là tổng", code: "CH-B2C-01", rows: data.revTimeline, unit: "đ", showTarget: true },
          { title: "Số lượng sản phẩm theo thời gian", subtitle: "Cột chồng theo danh mục, đường là tổng số SP", code: "CH-B2C-02", rows: data.qtyTimeline, unit: "sản phẩm", showTarget: false },
        ].map((cfg) => (
          <Panel
            key={cfg.code}
            title={cfg.title}
            subtitle={cfg.subtitle}
            code={cfg.code}
            isEmpty={cfg.rows.length === 0}
            action={<CompareToggle unit={filters.timeUnit} mode={compare} onChange={setCompareMode} />}
          >
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart
                data={cfg.rows}
                margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
                onClick={(e: { activePayload?: { payload?: { bucket?: string } }[] }) =>
                  toggle("bucket", e?.activePayload?.[0]?.payload?.bucket)
                }
                style={{ cursor: "pointer" }}
              >

                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={cfg.unit === "đ" ? shortLabel : (v: number) => formatNumber(v)} width={60} />
                <Tooltip
                  cursor={{ fill: "var(--secondary)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as Record<string, number>;
                    const total = Number(row["total"] ?? 0);
                    return (
                      <TooltipBox label={String(label)}>
                        {data.categories.map((c) => (
                          <TooltipRow
                            key={c}
                            color={categoryColor(c)}
                            name={c}
                            value={Number(row[c] ?? 0)}
                            unit={cfg.unit}
                            share={total ? (Number(row[c] ?? 0) / total) * 100 : undefined}
                          />
                        ))}
                        <TooltipRow name="Tổng" value={total} unit={cfg.unit} />
                        <CompareRow
                          mode={compare}
                          prev={row["prev"] === null || row["prev"] === undefined ? null : Number(row["prev"])}
                          delta={row["delta"] === null || row["delta"] === undefined ? null : Number(row["delta"])}
                          format={(n) => (cfg.unit === "đ" ? formatCurrency(n) : `${formatNumber(n)} ${cfg.unit}`)}
                        />
                        {cfg.showTarget && (
                          <TargetRow
                            actual={total}
                            target={
                              row["target"] === null || row["target"] === undefined
                                ? null
                                : Number(row["target"])
                            }
                          />
                        )}
                      </TooltipBox>
                    );
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {data.categories.map((c) => (
                  <Bar key={c} dataKey={c} stackId="a" fill={categoryColor(c)} />
                ))}
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Tổng"
                  stroke={TOTAL_COLOR}
                  strokeWidth={2}
                  dot={false}
                />
                {cfg.showTarget && (
                  <Line
                    type="monotone"
                    dataKey="target"
                    name="Target"
                    stroke={CHART_COLORS.accent}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls={false}
                  />
                )}
                {compare !== "none" && (
                  <Line
                    type="monotone"
                    dataKey="prev"
                    name={COMPARE_FULL_LABEL[compare]}
                    stroke={CHART_COLORS.axis}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    connectNulls={false}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
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

      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Cơ cấu doanh thu theo Tháng & Thứ"
          subtitle="Hàng: tháng — Cột: thứ trong tuần"
          code="CH-B2C-06"
          isEmpty={data.matrix.length === 0}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="px-2 py-1 text-left font-medium">Tháng</th>
                  {WEEKDAY_ORDER.map((w) => (
                    <th key={w} className="px-2 py-1 text-right font-medium">
                      {w}
                    </th>
                  ))}
                  <th className="px-2 py-1 text-right font-medium">Tổng</th>
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((m) => (
                  <tr key={m.month}>
                    <td className="px-2 py-1 font-medium">{m.month}</td>
                    {m.cells.map((c) => (
                      <td
                        key={c.weekday}
                        title={`${m.month} · ${c.weekday}: ${formatCurrency(c.value)}`}
                        className="px-2 py-1 text-right tabular-nums"
                        style={{
                          background:
                            c.value > 0
                              ? `color-mix(in oklab, var(--primary) ${Math.round((c.value / data.matrixMax) * 70) + 8}%, transparent)`
                              : undefined,
                        }}
                      >
                        {c.value > 0 ? formatShort(c.value) : "—"}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-semibold tabular-nums">{formatShort(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Top 10 khách hàng chi tiêu nhiều nhất"
          subtitle="Lọc theo SĐT; bấm vào cột để xem đơn hàng chi tiết bên dưới"
          code="CH-B2C-07"
          isEmpty={data.topCustomers.length === 0}
        >
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={data.topCustomers} layout="vertical" margin={{ top: 8, right: 60, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={shortLabel} />
              <YAxis type="category" dataKey="name" {...axisProps} width={140} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { name: string; phone: string; value: number; orderCount: number };
                  return (
                    <TooltipBox label={row.name}>
                      <p className="mb-1 text-muted-foreground">SĐT: {row.phone}</p>
                      <TooltipRow name="Chi tiêu" value={row.value} />
                      <TooltipRow name="Số đơn" value={row.orderCount} unit="đơn" />
                    </TooltipBox>
                  );
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: { phone?: string }) => toggle("phone", d?.phone)}
              >
                {data.topCustomers.map((c) => (
                  <Cell key={c.phone} fill={cellFill(c.phone, selectedPhone, CHART_COLORS.primary)} />
                ))}

                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: number) => formatShort(v)}
                  style={{ fontSize: 10, fill: CHART_COLORS.axis }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Số lượng khách hàng theo thời gian"
          subtitle="Kỳ đầu khách xuất hiện = mua một lần; kỳ sau họ mua lại = mua nhiều lần"
          code="CH-B2C-08"
          isEmpty={data.customerTimeline.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={data.customerTimeline}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
              onClick={(e: { activePayload?: { payload?: { bucket?: string } }[] }) =>
                toggle("bucket", e?.activePayload?.[0]?.payload?.bucket)
              }
              style={{ cursor: "pointer" }}
            >

              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} width={40} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as Record<string, number>;
                  const total = Number(row["total"] ?? 0);
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow
                        color={CHART_COLORS.dark}
                        name="Mua một lần"
                        value={Number(row["Mua một lần"] ?? 0)}
                        unit="khách"
                        share={total ? (Number(row["Mua một lần"] ?? 0) / total) * 100 : undefined}
                      />
                      <TooltipRow
                        color={CHART_COLORS.primary}
                        name="Mua nhiều lần"
                        value={Number(row["Mua nhiều lần"] ?? 0)}
                        unit="khách"
                        share={total ? (Number(row["Mua nhiều lần"] ?? 0) / total) * 100 : undefined}
                      />
                      <TooltipRow name="Tổng khách" value={total} unit="khách" />
                    </TooltipBox>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Mua một lần" stackId="a" fill={CHART_COLORS.dark} />
              <Bar dataKey="Mua nhiều lần" stackId="a" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="total" name="Tổng khách" stroke={TOTAL_COLOR} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Giá trị đơn trung bình theo Danh mục sản phẩm" code="CH-B2C-09" isEmpty={data.aovByCategory.length === 0}>
          <SimpleBar
            rows={data.aovByCategory}
            unit="đ"
            selected={sel["category"]}
            onSelect={(name) => toggle("category", name)}
            color={categoryColor}
          />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
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

        <Panel
          title="Doanh thu: khách mới vs khách quay lại"
          subtitle="Cột chồng theo thời gian — đơn đầu của khách là khách mới, các đơn sau là quay lại"
          code="CH-B2C-11"
          isEmpty={data.newVsReturn.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart
              data={data.newVsReturn}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
              onClick={(e: { activePayload?: { payload?: { bucket?: string } }[] }) =>
                toggle("bucket", e?.activePayload?.[0]?.payload?.bucket)
              }
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
                  const total = Number(row["total"] ?? 0);
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow
                        color={CHART_COLORS.dark}
                        name="Khách mới"
                        value={Number(row["Khách mới"] ?? 0)}
                        share={total ? (Number(row["Khách mới"] ?? 0) / total) * 100 : undefined}
                      />
                      <TooltipRow
                        color={CHART_COLORS.primary}
                        name="Khách quay lại"
                        value={Number(row["Khách quay lại"] ?? 0)}
                        share={total ? (Number(row["Khách quay lại"] ?? 0) / total) * 100 : undefined}
                      />
                      <TooltipRow name="Tổng" value={total} />
                    </TooltipBox>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Khách mới" stackId="a" fill={CHART_COLORS.dark} />
              <Bar dataKey="Khách quay lại" stackId="a" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="total" name="Tổng" stroke={TOTAL_COLOR} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="🚩 Chỉ số nổi bật" isEmpty={data.insights.length === 0}>
        <InsightList items={data.insights} />
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

