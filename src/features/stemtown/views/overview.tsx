import { Building2, Package, ReceiptText, ShoppingCart, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

import { FactTable, type Column } from "@/features/stemtown/components/fact-table";
import { DataTableView } from "@/features/stemtown/components/data-table-view";
import { FilterBar } from "@/features/stemtown/components/filters";
import { KpiCard } from "@/features/stemtown/components/kpi";
import { InsightList, Panel } from "@/features/stemtown/components/panel";
import { DashboardShell } from "@/features/stemtown/components/shell";
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
import {
  bucketLabel,
  bucketOf,
  customerKeyOf,
  defaultFilters,
  filterB2B,
  filterB2C,
  groupSum,
  segmentOf,
  sortBuckets,
  targetFor,
  targetForBucket,
  targetSubMetric,
  toSortedPairs,
  replaceB2BRows,
  COMPANY_COLOR,
  type Filters,
} from "@/features/stemtown/lib/dashboard-data";
import { loadImportedB2B } from "@/features/stemtown/lib/b2b-import";
import { CompareRow, CompareToggle } from "@/features/stemtown/components/compare-toggle";
import {
  COMPARE_FULL_LABEL,
  attachCompare,
  isCompareValid,
  withFullPeriod,
  type CompareMode,
} from "@/features/stemtown/lib/compare";
import { formatCurrency, formatNumber, formatPercent, formatShort } from "@/features/stemtown/lib/format";
import { cellFill, matchSel, useCrossFilter } from "@/features/stemtown/lib/cross-filter";

const CROSS_LABELS = {
  category: "Danh mục",
  branch: "Chi nhánh",
  model: "Mô hình",
  bucket: "Kỳ",
  month: "Tháng",
};

/**
 * Tên hiển thị cho chart "Doanh thu theo khu vực" — chart này gộp CHUNG chi nhánh B2C
 * (vd "STEMTOWN HCM") và khu vực B2B (vd "Hồ Chí Minh"), nên đổi tên hiển thị riêng cho rõ
 * đây là chi nhánh B2C, KHÔNG đổi giá trị gốc r.branch (vẫn dùng để lọc chéo/so khớp bình
 * thường ở mọi nơi khác).
 */
const regionLabel = (name: string) => (name === "STEMTOWN HCM" ? "B2C STEM TOWN HCM" : name);


export function OverviewPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const { sel, toggle, clear, clearAll, chips } = useCrossFilter(CROSS_LABELS);
  const category = sel["category"] ?? null;
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const compare: CompareMode = isCompareValid(filters.timeUnit, compareMode) ? compareMode : "none";
  const [dataVersion, setDataVersion] = useState(0);

  // Đồng bộ dữ liệu B2B đã import (nếu có) để trang Tổng quan dùng chung với trang B2B
  useEffect(() => {
    const stored = loadImportedB2B();
    if (!stored) return;
    const rows = replaceB2BRows(stored);
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    if (dates.length) {
      setFilters((f) => ({
        ...f,
        from: (dates[0] as string) < f.from ? (dates[0] as string) : f.from,
        to: (dates[dates.length - 1] as string) > f.to ? (dates[dates.length - 1] as string) : f.to,
      }));
    }
    setDataVersion((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => {
    void dataVersion;
    const keepB2C = (r: { category: string; branch: string; date: string }) =>
      matchSel(r.category, category) &&
      matchSel(r.branch, sel["branch"]) &&
      matchSel(bucketOf(r.date, filters.timeUnit), sel["bucket"]) &&
      matchSel(bucketOf(r.date, "month"), sel["month"]) &&
      (!sel["model"] || sel["model"] === "B2C");
    const keepB2B = (r: { branch: string; date: string }) =>
      (!category || category === "Vé đoàn") &&
      matchSel(r.branch, sel["branch"]) &&
      matchSel(bucketOf(r.date, filters.timeUnit), sel["bucket"]) &&
      matchSel(bucketOf(r.date, "month"), sel["month"]) &&
      (!sel["model"] || sel["model"] === "B2B");

    const b2c = filterB2C(filters).filter(keepB2C);
    const b2b = filterB2B(filters).filter(keepB2B);


    const revB2C = b2c.reduce((s, r) => s + r.revenue, 0);
    const revB2B = b2b.reduce((s, r) => s + r.revenueNet, 0);
    const total = revB2C + revB2B;

    // Target tổng (sheet "KPI") cho các tháng phủ trong khoảng đang lọc = target B2C + target B2B.
    // null nếu sheet KPI không có target cho CẢ 2 loại trong khoảng đang lọc.
    const targetB2COv = targetFor("B2C", filters.from, filters.to);
    const targetB2BOv = targetFor("B2B", filters.from, filters.to);
    const targetTotal =
      targetB2COv === null && targetB2BOv === null ? null : (targetB2COv ?? 0) + (targetB2BOv ?? 0);
    // Target "Số khách hàng" B2B — dùng chung dòng target "HỌC SINH" (B2B) trong sheet KPI (chị Anna
    // xác nhận không có dòng target riêng cho số khách hàng, dùng chung với dòng học sinh tham gia).
    const targetCustomersB2BOv = targetFor("B2B", filters.from, filters.to, "students");
    // Target "Số khách hàng" B2C dùng chung dòng target HỌC SINH (B2C), so với data.customers (giống
    // hệt cách trang B2C đang làm ở card "Khách hàng (có SĐT)") để 2 nơi luôn khớp nhau.
    const targetStudentsB2COv = targetFor("B2C", filters.from, filters.to, "students");

    const buckets = sortBuckets(
      Array.from(
        new Set([
          ...b2c.map((r) => bucketOf(r.date, filters.timeUnit)),
          ...b2b.map((r) => bucketOf(r.date, filters.timeUnit)),
        ]),
      ),
      filters.timeUnit,
    );
    const b2cByBucket = groupSum(b2c, (r) => bucketOf(r.date, filters.timeUnit), (r) => r.revenue);
    const b2bByBucket = groupSum(b2b, (r) => bucketOf(r.date, filters.timeUnit), (r) => r.revenueNet);
    const baseTimeline = buckets.map((b) => {
      const cB2C = b2cByBucket.get(b) ?? 0;
      const cB2B = b2bByBucket.get(b) ?? 0;
      // Target cho đúng bucket này — vẽ thành đường trên chart, cùng trục với cột. Khi đang cross-filter
      // riêng B2B hoặc B2C (bấm vào lát cắt ở chart "Phân loại doanh thu") thì target cũng phải theo
      // đúng loại đang chọn, không cộng cả 2 lại (nếu không sẽ sai — số thực tế chỉ còn 1 loại mà target
      // vẫn là tổng cả 2).
      const tB2B = targetForBucket("B2B", b, filters.timeUnit);
      const tB2C = targetForBucket("B2C", b, filters.timeUnit);
      const modelSel = sel["model"];
      const target =
        modelSel === "B2C"
          ? tB2C
          : modelSel === "B2B"
            ? tB2B
            : tB2B === null && tB2C === null
              ? null
              : (tB2B ?? 0) + (tB2C ?? 0);
      return {
        bucket: b,
        name: bucketLabel(b, filters.timeUnit),
        B2B: cB2B,
        B2C: cB2C,
        total: cB2B + cB2C,
        target,
      };
    });

    // Map giá trị trên TOÀN BỘ dữ liệu (giữ nguyên các bộ lọc khác) để kỳ trước
    // vẫn có số liệu khi nằm ngoài khoảng ngày đang lọc.
    const fullFilters = withFullPeriod(filters);
    const fullB2C = filterB2C(fullFilters).filter(keepB2C);
    const fullB2B = filterB2B(fullFilters).filter(keepB2B);

    const fullMap = new Map<string, number>();
    for (const r of fullB2C) {
      const k = bucketOf(r.date, filters.timeUnit);
      fullMap.set(k, (fullMap.get(k) ?? 0) + r.revenue);
    }
    for (const r of fullB2B) {
      const k = bucketOf(r.date, filters.timeUnit);
      fullMap.set(k, (fullMap.get(k) ?? 0) + r.revenueNet);
    }
    const timeline = attachCompare(baseTimeline, (r) => r.total, filters.timeUnit, compare, fullMap);

    const catMap = groupSum(b2c, (r) => r.category, (r) => r.revenue);
    const b2bRev = b2b.reduce((s, r) => s + r.revenueNet, 0);
    if (b2bRev > 0) catMap.set("Vé đoàn", (catMap.get("Vé đoàn") ?? 0) + b2bRev);
    const byCategory = toSortedPairs(catMap);

    const qtyCatMap = groupSum(b2c, (r) => r.category, (r) => r.quantity);
    // "Vé đoàn" ở B2C không có dòng nào -> số lượng Vé đoàn = Số HS nghiệm thu B2B (cột TongSoHSThucTe).
    // (dùng chung cho cả card "Số lượng theo Danh mục sản phẩm" lẫn %Target "Số khách hàng" B2B bên dưới)
    const b2bStudents = b2b.reduce((s, r) => s + r.students, 0);
    if (b2bStudents > 0) qtyCatMap.set("Vé đoàn", (qtyCatMap.get("Vé đoàn") ?? 0) + b2bStudents);
    const qtyByCategory = byCategory.map((c) => ({ name: c.name, value: qtyCatMap.get(c.name) ?? 0 }));

    const branchMap = groupSum(b2c, (r) => r.branch, (r) => r.revenue);
    for (const r of b2b) branchMap.set(r.branch, (branchMap.get(r.branch) ?? 0) + r.revenueNet);
    const byBranch = toSortedPairs(branchMap);

    const products = b2c.reduce((s, r) => s + r.quantity, 0) + b2b.reduce((s, r) => s + r.students, 0);
    const customers = new Set(b2c.filter((r) => r.phone).map((r) => r.phone)).size;
    const debt = b2b.reduce((s, r) => s + r.debt, 0);
    const collectedRate = revB2B > 0 ? ((revB2B - debt) / revB2B) * 100 : null;

    // "Doanh thu B2B": Gross + số khách hàng Trường/Công ty (unique theo TenKhachHang, dùng CHUNG
    // logic phân loại với trang B2B để 2 trang luôn khớp nhau).
    const grossB2B = b2b.reduce((s, r) => s + r.revenueGross, 0);
    const customerSegmentB2B = new Map<string, string>();
    b2b.forEach((r) => {
      const k = customerKeyOf(r);
      if (!customerSegmentB2B.has(k)) customerSegmentB2B.set(k, segmentOf(r));
    });
    let truongCount = 0;
    let congTyCount = 0;
    for (const seg of customerSegmentB2B.values()) {
      if (seg === "Công ty") congTyCount += 1;
      else truongCount += 1;
    }

    const topCat = byCategory[0];
    const bestBucket = timeline.slice().sort((a, b) => b.total - a.total)[0];
    const insights = [
      topCat && total > 0
        ? `Danh mục "${topCat.name}" đóng góp lớn nhất với ${formatCurrency(topCat.value)} (${formatPercent((topCat.value / total) * 100)} tổng doanh thu).`
        : null,
      bestBucket ? `Kỳ có doanh thu cao nhất: ${bestBucket.name} với ${formatCurrency(bestBucket.total)}.` : null,
      total > 0
        ? `Cơ cấu doanh thu: B2B ${formatPercent((revB2B / total) * 100)} – B2C ${formatPercent((revB2C / total) * 100)}.`
        : null,
      b2b.length > 0
        ? `${b2b.length} biên bản nghiệm thu hợp lệ (trạng thái 4–9) từ ${truongCount} trường; công nợ còn ${formatCurrency(debt)}.`
        : null,
    ].filter((x): x is string => Boolean(x));

    return {
      b2c,
      b2b,
      revB2C,
      revB2B,
      grossB2B,
      truongCount,
      congTyCount,
      total,
      targetTotal,
      targetB2COv,
      targetB2BOv,
      targetCustomersB2BOv,
      targetStudentsB2COv,
      b2bStudents,
      timeline,
      byCategory,
      qtyByCategory,
      byBranch,
      products,
      customers,
      debt,
      collectedRate,
      insights,
      split: [
        { name: "B2B", value: revB2B },
        { name: "B2C", value: revB2C },
      ].filter((d) => d.value > 0),
    };
  }, [filters, sel, compare, dataVersion]);

  const tableRows = data.byCategory;
  const columns: Column<{ name: string; value: number }>[] = [
    { key: "cat", header: "Danh mục sản phẩm", render: (r) => r.name },
    { key: "rev", header: "Doanh thu (đ)", render: (r) => formatNumber(r.value), align: "right" },
    {
      key: "share",
      header: "% đóng góp",
      render: (r) => (data.total > 0 ? formatPercent((r.value / data.total) * 100) : "—"),
      align: "right",
    },
  ];

  return (
    <DashboardShell
      title="Tổng quan doanh thu"
      description="Doanh nghiệp đang thế nào: quy mô doanh thu, cơ cấu B2B/B2C và xu hướng theo thời gian."
      tableView={<DataTableView columns={columns} rows={tableRows} fileName="tong-quan-doanh-thu" />}
    >
      <FilterBar
        filters={filters}
        onChange={setFilters}
        crossFilters={chips}
        onRemoveCrossFilter={clear}
        onClearCrossFilter={clearAll}
      />


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Tổng doanh thu"
          numeric={data.total}
          format={(n) => formatCurrency(n)}
          change={null}
          subtitle={"\n"}
          icon={<Wallet className="size-4" />}
          subMetrics={[
            targetSubMetric(data.total, data.targetTotal),
            { ...targetSubMetric(data.revB2C, data.targetB2COv), label: "% đạt Target B2C" },
            { ...targetSubMetric(data.revB2B, data.targetB2BOv), label: "% đạt Target B2B" },
          ]}
        />
        <KpiCard
          label="Doanh thu B2B"
          numeric={data.revB2B}
          format={(n) => formatCurrency(n)}
          change={null}
          subtitle={"\n"}
          icon={<Building2 className="size-4" />}
          subMetrics={[
            {
              label: "Doanh thu Gross",
              value: formatCurrency(data.grossB2B),
              belowText: targetSubMetric(data.grossB2B, data.targetB2BOv).value,
            },
            {
              label: "Doanh thu Net",
              value: formatCurrency(data.revB2B),
              belowText: targetSubMetric(data.revB2B, data.targetB2BOv).value,
            },
            { label: "Số khách hàng Trường", value: `${formatNumber(data.truongCount)} trường` },
            {
              label: "Số khách hàng Công ty",
              value: `${formatNumber(data.congTyCount)} công ty`,
              valueStyle: { color: COMPANY_COLOR },
            },
            {
              ...targetSubMetric(
                data.b2bStudents,
                data.targetCustomersB2BOv,
                (n) => `${formatNumber(Math.round(n))} khách hàng`,
              ),
              label: "% đạt Target (vé đoàn)",
            },
          ]}
        />
        <KpiCard
          label="Doanh thu B2C"
          numeric={data.revB2C}
          format={(n) => formatCurrency(n)}
          change={null}
          subtitle={"\n"}
          icon={<ShoppingCart className="size-4" />}
          subMetrics={[
            { label: "Số khách hàng (có SĐT)", value: `${formatNumber(data.customers)} khách` },
            { ...targetSubMetric(data.revB2C, data.targetB2COv), label: "% đạt Target doanh thu" },
            {
              ...targetSubMetric(
                data.customers,
                data.targetStudentsB2COv,
                (n) => `${formatNumber(Math.round(n))} khách`,
              ),
              label: "% đạt Target học sinh",
            },
          ]}
        />
        <KpiCard
          label="Tổng số sản phẩm"
          numeric={data.products}
          format={(n) => formatNumber(Math.round(n))}
          unit="sản phẩm"
          change={null}
          subtitle={"\n"}
          icon={<Package className="size-4" />}
        />
        <KpiCard
          label="Tổng biên bản B2B"
          numeric={data.b2b.length}
          format={(n) => formatNumber(Math.round(n))}
          unit="biên bản"
          change={null}
          subtitle={"\n"}
          icon={<ReceiptText className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title="Doanh thu theo thời gian"
          subtitle={"\n"}
          code="CH-OV-01"
          className="xl:col-span-2"
          isEmpty={data.timeline.length === 0}
          action={
            <CompareToggle unit={filters.timeUnit} mode={compare} onChange={setCompareMode} />
          }
        >
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={data.timeline}
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
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as {
                    bucket: string;
                    B2B: number;
                    B2C: number;
                    total: number;
                    target: number | null;
                    prev: number | null;
                    delta: number | null;
                  };
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow
                        color={CHART_COLORS.dark}
                        name="B2B"
                        value={row.B2B}
                        share={row.total ? (row.B2B / row.total) * 100 : undefined}
                      />
                      <TooltipRow
                        color={CHART_COLORS.primary}
                        name="B2C"
                        value={row.B2C}
                        share={row.total ? (row.B2C / row.total) * 100 : undefined}
                      />
                      <TooltipRow name="Tổng" value={row.total} />
                      <CompareRow
                        mode={compare}
                        prev={row.prev}
                        delta={row.delta}
                        format={formatCurrency}
                      />
                      <TargetRow actual={row.total} target={row.target} />
                    </TooltipBox>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="B2B" stackId="a" fill={CHART_COLORS.dark} radius={[0, 0, 0, 0]} />
              <Bar dataKey="B2C" stackId="a" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="total"
                  position="top"
                  formatter={(v: number) => formatShort(v)}
                  style={{ fontSize: 10, fill: CHART_COLORS.axis }}
                />
              </Bar>
              <Line
                type="monotone"
                dataKey="total"
                name="Tổng doanh thu"
                stroke={TOTAL_COLOR}
                strokeWidth={2}
                dot={false}
              />
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

        <Panel
          title="Phân loại doanh thu"
          subtitle="Tỷ trọng B2B và B2C"
          code="CH-OV-02"
          isEmpty={data.split.length === 0}
        >
          <ResponsiveContainer width="100%" height={320}>
            <PieChart>
              <Pie
                data={data.split}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="80%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                label={renderInsideLabel}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("model", d?.name)}
              >
                {data.split.map((d, i) => (
                  <Cell
                    key={d.name}
                    fill={cellFill(d.name, sel["model"], DONUT_COLORS[i % DONUT_COLORS.length] as string)}
                  />
                ))}
              </Pie>

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0];
                  const value = Number(p?.value ?? 0);
                  return (
                    <TooltipBox label={String(p?.name)}>
                      <TooltipRow
                        name="Doanh thu"
                        value={value}
                        share={data.total ? (value / data.total) * 100 : undefined}
                      />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <DonutLegend rows={data.split} total={data.total} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Doanh thu theo Danh mục sản phẩm"
          subtitle="Đối với B2B thì tính sản phẩm là Vé Đoàn"
          code="CH-OV-03"
          isEmpty={data.byCategory.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.byCategory} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={shortLabel} />
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
                        name="Doanh thu"
                        value={value}
                        share={data.total ? (value / data.total) * 100 : undefined}
                      />
                    </TooltipBox>
                  );
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                onClick={(d: { name?: string }) => toggle("category", d?.name)}
                cursor="pointer"
              >
                {data.byCategory.map((d) => (
                  <Cell key={d.name} fill={cellFill(d.name, sel["category"], categoryColor(d.name))} />
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

        <Panel
          title="Số lượng sản phẩm theo thời gian"
          code="CH-OV-04"
          isEmpty={data.qtyByCategory.length === 0}
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.qtyByCategory} layout="vertical" margin={{ top: 8, right: 48, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} />
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
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow name="Số lượng" value={Number(payload[0]?.value ?? 0)} unit="sản phẩm" />
                    </TooltipBox>
                  );
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("category", d?.name)}
              >
                {data.qtyByCategory.map((d) => (
                  <Cell key={d.name} fill={cellFill(d.name, sel["category"], categoryColor(d.name))} />
                ))}

                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v: number) => formatNumber(v)}
                  style={{ fontSize: 10, fill: CHART_COLORS.axis }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FactTable
            title="Bảng tổng hợp doanh thu theo danh mục"
            subtitle="Chọn cột hiển thị và xuất dữ liệu"
            columns={columns}
            rows={tableRows}
            fileName="tong-quan-doanh-thu"
          />
        </div>

        <Panel
          title="Doanh thu theo khu vực"
          subtitle={"\n"}
          code="CH-OV-05"
          isEmpty={data.byBranch.length === 0}
        >
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={data.byBranch}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="80%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                label={renderInsideLabel}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("branch", d?.name)}
              >
                {data.byBranch.map((d, i) => (
                  <Cell
                    key={d.name}
                    fill={cellFill(d.name, sel["branch"], DONUT_COLORS[i % DONUT_COLORS.length] as string)}
                  />
                ))}
              </Pie>

              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const value = Number(payload[0]?.value ?? 0);
                  return (
                    <TooltipBox label={regionLabel(String(payload[0]?.name))}>
                      <TooltipRow
                        name="Doanh thu"
                        value={value}
                        share={data.total ? (value / data.total) * 100 : undefined}
                      />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <DonutLegend
            rows={data.byBranch.map((r) => ({ ...r, name: regionLabel(r.name) }))}
            total={data.total}
          />
        </Panel>
      </div>

      <Panel title="🚩Chỉ số nổi bật" subtitle={"\n"} isEmpty={data.insights.length === 0}>
        <InsightList items={data.insights} />
      </Panel>
    </DashboardShell>
  );
}
