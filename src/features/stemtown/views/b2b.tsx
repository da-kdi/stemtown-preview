import { AlertTriangle, Banknote, Building2, FileCheck2, GraduationCap, Tag, Users, Wallet } from "lucide-react";
import { CustomChartsSection } from "@/features/stemtown/components/CustomChartsSection";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
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
  TooltipBox,
  TooltipRow,
  TargetRow,
  axisProps,
  renderInsideLabel,
  shortLabel,
  DonutLegend,
} from "@/features/stemtown/components/chart-kit";
import { FactTable, type Column } from "@/features/stemtown/components/fact-table";
import { DataTableView } from "@/features/stemtown/components/data-table-view";
import { FilterBar } from "@/features/stemtown/components/filters";
import { KpiCard } from "@/features/stemtown/components/kpi";
import { InsightList, Panel } from "@/features/stemtown/components/panel";
import { DashboardShell } from "@/features/stemtown/components/shell";
import { ImportDataBar } from "@/features/stemtown/components/import-data";
import { loadImportedB2B } from "@/features/stemtown/lib/b2b-import";
import { TourSection } from "@/features/stemtown/views/b2b-tours";
import {
  b2bBranchOptions,
  bucketLabel,
  bucketOf,
  defaultFilters,
  filterB2B,
  replaceB2BRows,
  groupSum,
  sortBuckets,
  toSortedPairs,
  segmentOf,
  customerKeyOf,
  entityOf,
  SEGMENT_ORDER,
  COMPANY_COLOR,
  targetFor,
  targetForBucket,
  targetSubMetric,
  type B2BRow,
  type Filters,
} from "@/features/stemtown/lib/dashboard-data";
import { formatCurrency, formatNumber, formatPercent, formatShort } from "@/features/stemtown/lib/format";
import { cellFill, matchSel, useCrossFilter } from "@/features/stemtown/lib/cross-filter";
import { CompareRow, CompareToggle } from "@/features/stemtown/components/compare-toggle";
import {
  COMPARE_FULL_LABEL,
  attachCompare,
  isCompareValid,
  withFullPeriod,
  type CompareMode,
} from "@/features/stemtown/lib/compare";

const WEEKDAY_ORDER = ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ nhật"];

/** yyyy-MM-dd -> dd-MM-yy (dễ nhìn trong bảng chi tiết). */
const toDMY = (s: string) => {
  const [y, m, d] = s.split("-");
  return d && m && y ? `${d}-${m}-${y.slice(2)}` : s;
};

/** Màu xanh ombre cho heatmap hợp tác (đậm dần theo số lần hợp tác). */
const HEATMAP_BLUE = "oklch(0.55 0.17 250)";

/** Tên các khoảng đơn giá cố định (theo cột T "DonGia") cho chart "Đơn giá học sinh theo phân khúc". */
const PRICE_BAND_NAMES = ["< 150k", "151k – 200k", "201k – 250k", "251k – 300k", "> 300k"];

/**
 * Bảng màu riêng cho chart "Doanh thu theo khu vực" — CỐ TÌNH né xanh dương (primary) và cam
 * (brand-accent) vì 2 màu đó đã dùng cho "Trường"/"Công ty" và các phần còn lại của dashboard.
 */
const BRANCH_COLORS = [
  "oklch(0.70 0.13 155)", // xanh lá
  "oklch(0.66 0.16 300)", // tím
  "oklch(0.70 0.13 330)", // hồng
  "oklch(0.78 0.12 195)", // xanh ngọc
  "oklch(0.75 0.14 60)", // vàng đất
];

const CROSS_LABELS = {
  bucket: "Kỳ",
  branch: "Chi nhánh",
  level: "Cấp học",
  school: "Trường",
  band: "Đơn giá HS",
  customer: "Khách hàng",
  entity: "Loại khách hàng",
};

/** Khoảng đơn giá theo cột T "DonGia" (đọc thẳng, không tự tính lại từ DoanhThuNet/HS). */
const bandOf = (r: B2BRow): string | null => {
  const price = r.donGia;
  if (!price || price <= 0) return null;
  if (price < 150_000) return "< 150k";
  if (price <= 200_000) return "151k – 200k";
  if (price <= 250_000) return "201k – 250k";
  if (price <= 300_000) return "251k – 300k";
  return "> 300k";
};

/** Màu ô/cột theo phân khúc: "Công ty" luôn vàng (mờ đi khi đang lọc chéo dim khác). */
const segmentCellFill = (name: string, selected: string | null | undefined) =>
  name === "Công ty"
    ? selected && selected !== name
      ? "var(--brand-support)"
      : COMPANY_COLOR
    : cellFill(name, selected, CHART_COLORS.primary);

export function B2BPage() {
  const [filters, setFilters] = useState<Filters>({ ...defaultFilters, model: "b2b" });
  const { sel, toggle, clearAll, chips } = useCrossFilter(CROSS_LABELS);
  const school = sel["school"] ?? null;
  const [compareMode, setCompareMode] = useState<CompareMode>("none");
  const compare: CompareMode = isCompareValid(filters.timeUnit, compareMode) ? compareMode : "none";
  const [dataVersion, setDataVersion] = useState(0);
  const [imported, setImported] = useState(false);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const applyRows = useCallback((raw: Record<string, unknown>[] | null) => {
    const rows = replaceB2BRows(raw);
    setImported(Boolean(raw));
    const dates = rows.map((r) => r.date).filter(Boolean).sort();
    if (dates.length) {
      setFilters((f) => ({ ...f, from: dates[0] as string, to: dates[dates.length - 1] as string }));
    }
    clearAll();
    setDataVersion((v) => v + 1);
  }, [clearAll]);

  useEffect(() => {
    const stored = loadImportedB2B();
    if (stored) applyRows(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = useMemo(() => {
    const all = filterB2B(filters);
    const rows = all.filter(
      (r) =>
        matchSel(r.schoolName, sel["school"]) &&
        matchSel(r.branch, sel["branch"]) &&
        matchSel(segmentOf(r), sel["level"]) &&
        matchSel(customerKeyOf(r), sel["customer"]) &&
        matchSel(entityOf(r), sel["entity"]) &&
        matchSel(bucketOf(r.date, filters.timeUnit), sel["bucket"]) &&
        matchSel(bandOf(r), sel["band"]),
    );


    const revenue = rows.reduce((s, r) => s + r.revenueNet, 0);
    const grossTotal = rows.reduce((s, r) => s + r.revenueGross, 0);
    const tongCKTotal = rows.reduce((s, r) => s + r.tongCK, 0);
    const students = rows.reduce((s, r) => s + r.students, 0);
    const schools = new Set(rows.map((r) => r.schoolIdCon)).size;
    const contracts = new Set(rows.map((r) => r.contract)).size;
    const avgContract = contracts > 0 ? revenue / contracts : null;

    // Target doanh thu (sheet "KPI") cho các tháng phủ trong khoảng đang lọc — so với Doanh thu Net.
    const targetB2B = targetFor("B2B", filters.from, filters.to);
    // Target số học sinh tham gia (dòng LoaiSanPham = "HỌC SINH" trong sheet KPI).
    const targetStudentsB2B = targetFor("B2B", filters.from, filters.to, "students");

    const buckets = sortBuckets(
      Array.from(new Set(rows.map((r) => bucketOf(r.date, filters.timeUnit)))),
      filters.timeUnit,
    );
    const byBucket = groupSum(rows, (r) => bucketOf(r.date, filters.timeUnit), (r) => r.revenueNet);
    let running = 0;
    const baseTimeline = buckets.map((b) => {
      const value = byBucket.get(b) ?? 0;
      running += value;
      // Target (đã chia đều theo ngày) cho đúng bucket này — vẽ thành đường trên chart để so
      // trực quan với cột, cùng trục với "Doanh thu net" (không lệch trục phải).
      const target = targetForBucket("B2B", b, filters.timeUnit);
      return { bucket: b, name: bucketLabel(b, filters.timeUnit), value, cumulative: running, target };
    });
    const fullRows = filterB2B(withFullPeriod(filters)).filter((r) => !school || r.schoolName === school);
    const fullMap = groupSum(fullRows, (r) => bucketOf(r.date, filters.timeUnit), (r) => r.revenueNet);
    const timeline = attachCompare(baseTimeline, (r) => r.value, filters.timeUnit, compare, fullMap);

    const byBucketStudents = groupSum(rows, (r) => bucketOf(r.date, filters.timeUnit), (r) => r.students);
    // "HS hợp đồng" (cột S) lặp lại giống nhau trên mọi biên bản của CÙNG 1 hợp đồng -> phải lấy UNIQUE
    // theo Số hợp đồng (r.contract) trước khi cộng, tránh cộng trùng khi 1 hợp đồng có nhiều biên bản.
    const hopDongByBucketContract = new Map<string, Map<string, number>>();
    rows.forEach((r, idx) => {
      const b = bucketOf(r.date, filters.timeUnit);
      const key = r.contract && r.contract !== "—" ? r.contract : `__no_contract_${idx}`;
      if (!hopDongByBucketContract.has(b)) hopDongByBucketContract.set(b, new Map());
      hopDongByBucketContract.get(b)!.set(key, r.soHSHopDong);
    });
    const byBucketHopDong = new Map<string, number>();
    for (const [b, m] of hopDongByBucketContract) {
      byBucketHopDong.set(b, Array.from(m.values()).reduce((s, v) => s + v, 0));
    }
    const hsTimeline = buckets.map((b) => {
      const hsNghiemThu = byBucketStudents.get(b) ?? 0;
      const hsHopDong = byBucketHopDong.get(b) ?? 0;
      return {
        bucket: b,
        name: bucketLabel(b, filters.timeUnit),
        "HS nghiệm thu": hsNghiemThu,
        "HS hợp đồng": hsHopDong,
        "HS chênh lệch": hsHopDong - hsNghiemThu,
      };
    });

    const byBranch = toSortedPairs(groupSum(rows, (r) => r.branch, (r) => r.revenueNet));
    const segmentMap = groupSum(rows, segmentOf, (r) => r.revenueNet);
    // Số HS thực tế (cột I) theo từng phân khúc — hiển thị kèm label trên chart "Doanh thu theo cấp học".
    const studentsBySegment = groupSum(rows, segmentOf, (r) => r.students);
    const bySegment = SEGMENT_ORDER.map((name) => ({
      name,
      value: segmentMap.get(name) ?? 0,
      students: studentsBySegment.get(name) ?? 0,
    }));
    const topSegment = [...bySegment].sort((a, b) => b.value - a.value)[0];
    const bySchool = toSortedPairs(groupSum(rows, (r) => r.schoolName, (r) => r.revenueNet)).slice(0, 12);

    // Phân khúc theo KHÁCH HÀNG (1 khách -> 1 phân khúc cố định, dùng chung cho ranking + heatmap + "Cty & Trường")
    const customerSegment = new Map<string, string>();
    rows.forEach((r) => {
      const k = customerKeyOf(r);
      if (!customerSegment.has(k)) customerSegment.set(k, segmentOf(r));
    });
    const studentsByCustomer = groupSum(rows, customerKeyOf, (r) => r.students);
    // "Số HS Hợp đồng" (cột S) lặp lại theo hợp đồng -> lấy UNIQUE theo hợp đồng của từng khách hàng trước khi cộng.
    const hopDongByCustomerContract = new Map<string, Map<string, number>>();
    rows.forEach((r, idx) => {
      const k = customerKeyOf(r);
      const key = r.contract && r.contract !== "—" ? r.contract : `__no_contract_${idx}`;
      if (!hopDongByCustomerContract.has(k)) hopDongByCustomerContract.set(k, new Map());
      hopDongByCustomerContract.get(k)!.set(key, r.soHSHopDong);
    });
    const hopDongByCustomer = new Map<string, number>();
    for (const [k, m] of hopDongByCustomerContract) {
      hopDongByCustomer.set(k, Array.from(m.values()).reduce((s, v) => s + v, 0));
    }

    const byCustomer = toSortedPairs(groupSum(rows, customerKeyOf, (r) => r.revenueNet))
      .slice(0, 10)
      .map((d) => ({
        ...d,
        segment: customerSegment.get(d.name) ?? "Trường",
        hopDong: hopDongByCustomer.get(d.name) ?? 0,
        nghiemThu: studentsByCustomer.get(d.name) ?? 0,
      }));

    // "Số lượng Cty & Trường": đếm khách hàng duy nhất + tổng số HS trải nghiệm của mỗi nhóm
    let congTyCount = 0;
    let truongCount = 0;
    let congTyStudents = 0;
    let truongStudents = 0;
    for (const [name, segment] of customerSegment) {
      const st = studentsByCustomer.get(name) ?? 0;
      if (segment === "Công ty") {
        congTyCount += 1;
        congTyStudents += st;
      } else {
        truongCount += 1;
        truongStudents += st;
      }
    }
    const entitySummary = [
      { name: "Công ty", value: congTyCount, students: congTyStudents },
      { name: "Trường", value: truongCount, students: truongStudents },
    ];

    // "Thống kê theo số Hợp đồng và BBNT": mỗi khoảng đơn giá (cột T DonGia) đếm cả số BIÊN BẢN
    // (BBNT, mỗi dòng 1 biên bản) lẫn số HỢP ĐỒNG DUY NHẤT (1 hợp đồng có thể có nhiều biên bản).
    const priceBands = PRICE_BAND_NAMES.map((name) => {
      const brows = rows.filter((r) => bandOf(r) === name);
      const uniqueContracts = new Set(
        brows.map((r, idx) => (r.contract && r.contract !== "—" ? r.contract : `__no_contract_${idx}`)),
      );
      return { name, bienBan: brows.length, hopDong: uniqueContracts.size };
    });

    // Số lần hợp tác của từng KHÁCH HÀNG (cột R, unique) theo năm — "count" = số HỢP ĐỒNG duy nhất
    // (không phải số dòng biên bản, vì 1 hợp đồng có thể có nhiều biên bản), "students" = tổng
    // TongSoHSThucTe (sum toàn bộ, không unique). Sắp giảm dần theo tổng số hợp đồng.
    const years = sortBuckets(Array.from(new Set(rows.map((r) => bucketOf(r.date, "year")))), "year");
    const customerNames = Array.from(new Set(rows.map(customerKeyOf)));
    const heatmap = customerNames
      .map((name) => {
        const crows = rows.filter((r) => customerKeyOf(r) === name);
        const cells = years.map((y) => {
          const yrows = crows.filter((r) => bucketOf(r.date, "year") === y);
          const uniqueContracts = new Set(
            yrows.map((r, idx) => (r.contract && r.contract !== "—" ? r.contract : `__no_contract_${idx}`)),
          );
          return {
            year: y,
            count: uniqueContracts.size,
            students: yrows.reduce((s, r) => s + r.students, 0),
          };
        });
        return {
          name,
          segment: customerSegment.get(name) ?? "Trường",
          cells,
          total: cells.reduce((s, c) => s + c.count, 0),
          totalStudents: cells.reduce((s, c) => s + c.students, 0),
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
    const heatMax = Math.max(1, ...heatmap.flatMap((h) => h.cells.map((c) => c.count)));

    // Ma trận Doanh thu Gross theo Tháng → Tuần (trong tháng) → Thứ (theo ngày trải nghiệm r.date)
    const womOf = (dateStr: string) => Math.floor((Number(dateStr.split("-")[2] ?? "1") - 1) / 7) + 1;
    const grossMonths = sortBuckets(Array.from(new Set(rows.map((r) => bucketOf(r.date, "month")))), "month");
    const grossMonthWeekMatrix = grossMonths.map((mk) => {
      const mrows = rows.filter((r) => bucketOf(r.date, "month") === mk);
      const weekNums = Array.from(new Set(mrows.map((r) => womOf(r.date)))).sort((a, b) => a - b);
      const weeks = weekNums.map((wn) => {
        const cells = WEEKDAY_ORDER.map((wd) => ({
          weekday: wd,
          value: mrows
            .filter((r) => womOf(r.date) === wn && bucketOf(r.date, "weekday") === wd)
            .reduce((s, r) => s + r.revenueGross, 0),
        }));
        return { weekLabel: `Tuần ${wn}`, cells, total: cells.reduce((s, c) => s + c.value, 0) };
      });
      const monthCells = WEEKDAY_ORDER.map((wd) => ({
        weekday: wd,
        value: mrows.filter((r) => bucketOf(r.date, "weekday") === wd).reduce((s, r) => s + r.revenueGross, 0),
      }));
      return {
        monthKey: mk,
        month: bucketLabel(mk, "month"),
        weeks,
        monthCells,
        total: mrows.reduce((s, r) => s + r.revenueGross, 0),
      };
    });
    const grossMonthWeekMax = Math.max(
      1,
      ...grossMonthWeekMatrix.flatMap((m) => m.weeks.flatMap((w) => w.cells.map((c) => c.value))),
      ...grossMonthWeekMatrix.flatMap((m) => m.monthCells.map((c) => c.value)),
    );

    const collectedTotal = rows.reduce((s, r) => s + r.collected, 0);
    const recovery = Array.from(
      rows.reduce((map, r) => {
        const cur = map.get(r.branch) ?? { name: r.branch, collected: 0, debt: 0 };
        cur.collected += r.collected;
        cur.debt += r.debt;
        map.set(r.branch, cur);
        return map;
      }, new Map<string, { name: string; collected: number; debt: number }>()),
      ([, v]) => ({ ...v, rate: v.collected + v.debt > 0 ? (v.collected / (v.collected + v.debt)) * 100 : 0 }),
    ).sort((a, b) => b.collected + b.debt - (a.collected + a.debt));

    const debt = rows.reduce((s, r) => s + r.debt, 0);
    const recoveryRate = collectedTotal + debt > 0 ? (collectedTotal / (collectedTotal + debt)) * 100 : null;
    const topSchool = bySchool[0];
    const insights = [
      topSchool && revenue > 0
        ? `Trường dẫn đầu: ${topSchool.name} với ${formatCurrency(topSchool.value)} (${formatPercent((topSchool.value / revenue) * 100)} doanh thu B2B).`
        : null,
      topSegment && topSegment.value > 0 ? `Cấp học đóng góp nhiều nhất: ${topSegment.name} (${formatCurrency(topSegment.value)}).` : null,
      students > 0 ? `Tổng ${formatNumber(students)} học sinh nghiệm thu trên ${formatNumber(rows.length)} biên bản hợp lệ.` : null,
      debt > 0 ? `Công nợ còn lại ${formatCurrency(debt)} trên tổng doanh thu net.` : null,
    ].filter((x): x is string => Boolean(x));

    return {
      rows,
      revenue,
      grossTotal,
      tongCKTotal,
      students,
      schools,
      contracts,
      avgContract,
      targetB2B,
      targetStudentsB2B,
      timeline,
      hsTimeline,
      byBranch,
      bySegment,
      bySchool,
      byCustomer,
      entitySummary,
      priceBands,
      heatmap,
      years,
      heatMax,
      grossMonthWeekMatrix,
      grossMonthWeekMax,
      insights,
      recovery,
      recoveryRate,
      collectedTotal,
      debt,
    };
  }, [filters, sel, school, compare, dataVersion]);

  const columns: Column<B2BRow>[] = [
    { key: "experienceDate", header: "Ngày trải nghiệm", render: (r) => (r.experienceDate ? toDMY(r.experienceDate) : "—") },
    { key: "schoolKey", header: "Mã khách hàng", render: (r) => r.schoolIdCon },
    {
      key: "customerName",
      header: "Tên khách hàng",
      render: (r) => r.customerName ?? "—",
      noTruncate: true,
    },
    {
      key: "level",
      header: "Cấp học",
      render: (r) => segmentOf(r),
      cellStyle: (r) =>
        segmentOf(r) === "Công ty"
          ? { background: `color-mix(in oklab, ${COMPANY_COLOR} 35%, transparent)`, fontWeight: 600 }
          : undefined,
    },
    { key: "soHSHopDong", header: "Số HS hợp đồng", render: (r) => formatNumber(r.soHSHopDong), align: "right" },
    { key: "students", header: "Tổng số HS thực tế", render: (r) => formatNumber(r.students), align: "right" },
    { key: "donGia", header: "Đơn giá (đ)", render: (r) => formatNumber(r.donGia), align: "right" },
    { key: "gross", header: "Doanh thu gross (đ)", render: (r) => formatNumber(r.revenueGross), align: "right" },
    { key: "tongCK", header: "Tổng CK (đ)", render: (r) => formatNumber(r.tongCK), align: "right" },
    { key: "net", header: "Doanh thu net (đ)", render: (r) => formatNumber(r.revenueNet), align: "right" },
    { key: "duThu", header: "Dự thu (đ)", render: (r) => formatNumber(r.duThu), align: "right" },
    { key: "debt", header: "Công nợ (đ)", render: (r) => formatNumber(r.debt), align: "right" },
    { key: "contract", header: "Số hợp đồng", render: (r) => r.contract },
    { key: "status", header: "Trạng thái biên bản", render: (r) => r.status },
    { key: "id", header: "Biên bản ID", render: (r) => r.bienBanId },
    { key: "date", header: "Ngày tạo biên bản", render: (r) => r.createdDate || "—" },
    { key: "creator", header: "Người tạo biên bản", render: (r) => r.creator },
  ];

  // Ngày trải nghiệm gần nhất (gần hôm nay) hiển thị trên cùng.
  const sortedRows = [...data.rows].sort((a, b) =>
    (b.experienceDate || "").localeCompare(a.experienceDate || ""),
  );

  return (
    <DashboardShell
      title="B2B - Khách đoàn"
      description="Doanh thu trường học từ biên bản nghiệm thu hợp lệ (trạng thái 4–9)."
      tableView={<DataTableView columns={columns} rows={sortedRows} fileName="b2b-bien-ban-nghiem-thu" />}
    >
      <ImportDataBar onImported={applyRows} imported={imported} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        show={{ model: false, branch: true, category: false, source: false }}
        branchList={b2bBranchOptions}
        crossFilters={chips}
        onRemoveCrossFilter={(dim) => toggle(dim, sel[dim])}
        onClearCrossFilter={clearAll}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Doanh thu B2B (Gross)"
          numeric={data.grossTotal}
          format={formatCurrency}
          change={null}
          subtitle={"\n"}
          icon={<Banknote className="size-4" />}
          subMetrics={[targetSubMetric(data.grossTotal, data.targetB2B)]}
        />
        <KpiCard
          label="Doanh thu B2B (Net)"
          numeric={data.revenue}
          format={formatCurrency}
          change={null}
          subtitle={"\n"}
          icon={<Wallet className="size-4" />}
          subMetrics={[targetSubMetric(data.revenue, data.targetB2B)]}
        />
        <KpiCard
          label="Tổng CK"
          numeric={data.tongCKTotal}
          format={formatCurrency}
          change={null}
          subtitle={"\n"}
          icon={<Tag className="size-4" />}
          subMetrics={[
            {
              label: "% so với Doanh thu Gross",
              value: data.grossTotal ? formatPercent((data.tongCKTotal / data.grossTotal) * 100) : "—",
            },
            {
              label: "% so với Doanh thu Net",
              value: data.revenue ? formatPercent((data.tongCKTotal / data.revenue) * 100) : "—",
            },
          ]}
        />
        <KpiCard
          label="Công nợ"
          numeric={data.debt}
          format={formatCurrency}
          change={null}
          subtitle={data.revenue ? `${formatPercent((data.debt / data.revenue) * 100)} so với Doanh thu Net` : "\n"}
          icon={<AlertTriangle className="size-4" />}
          valueClassName="text-destructive"
        />
        <KpiCard
          label="Số khách hàng"
          numeric={data.entitySummary.reduce((s, d) => s + d.value, 0)}
          format={(n) => formatNumber(Math.round(n))}
          unit="khách hàng"
          change={null}
          subMetrics={data.entitySummary.map((d) => ({
            label: d.name,
            value: formatNumber(d.value),
            valueStyle: d.name === "Công ty" ? { color: COMPANY_COLOR } : undefined,
          }))}
          icon={<Building2 className="size-4" />}
        />
        <KpiCard
          label="Số biên bản nghiệm thu"
          numeric={data.rows.length}
          format={(n) => formatNumber(Math.round(n))}
          unit="biên bản"
          change={null}
          icon={<FileCheck2 className="size-4" />}
        />
        <KpiCard
          label="Số học sinh tham gia"
          numeric={data.students}
          format={(n) => formatNumber(Math.round(n))}
          unit="học sinh"
          change={null}
          subtitle={"\n"}
          icon={<GraduationCap className="size-4" />}
          subMetrics={[
            targetSubMetric(data.students, data.targetStudentsB2B, (n) => `${formatNumber(Math.round(n))} HS`),
          ]}
        />
        <KpiCard
          label="Giá trị hợp đồng trung bình"
          {...(data.avgContract === null ? { unavailable: true } : { numeric: data.avgContract, format: formatCurrency })}
          change={null}
          subtitle={`${formatNumber(data.contracts)} hợp đồng`}
          icon={<Users className="size-4" />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Doanh thu B2B theo thời gian"
          subtitle={"\n"}
          code="CH-B2B-01"
          isEmpty={data.timeline.length === 0}
          action={<CompareToggle unit={filters.timeUnit} mode={compare} onChange={setCompareMode} />}
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
              <YAxis yAxisId="left" {...axisProps} tickFormatter={shortLabel} width={60} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as {
                    bucket: string;
                    value: number;
                    cumulative: number;
                    target: number | null;
                    prev: number | null;
                    delta: number | null;
                  };
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow color={CHART_COLORS.primary} name="Doanh thu net" value={row.value} />
                      <TooltipRow color={CHART_COLORS.accent} name="Lũy kế" value={row.cumulative} />
                      <CompareRow mode={compare} prev={row.prev} delta={row.delta} format={formatCurrency} />
                      <TargetRow actual={row.value} target={row.target} />
                    </TooltipBox>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar
                yAxisId="left"
                dataKey="value"
                name="Doanh thu net"
                fill={CHART_COLORS.primary}
                radius={[4, 4, 0, 0]}
                cursor="pointer"
              />
              <Line
                yAxisId="left"
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
                  yAxisId="left"
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
          title="Số lượng HS nghiệm thu vs Hợp đồng"
          subtitle={"\n"}
          code="CH-B2B-02"
          isEmpty={data.hsTimeline.length === 0}
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={data.hsTimeline}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
              onClick={(e: { activePayload?: { payload?: { bucket?: string } }[] }) =>
                toggle("bucket", e?.activePayload?.[0]?.payload?.bucket)
              }
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis {...axisProps} width={44} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as Record<string, number>;
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow
                        color={CHART_COLORS.primary}
                        name="HS nghiệm thu"
                        value={Number(row["HS nghiệm thu"] ?? 0)}
                        unit="học sinh"
                      />
                      <TooltipRow
                        color={CHART_COLORS.dark}
                        name="HS hợp đồng"
                        value={Number(row["HS hợp đồng"] ?? 0)}
                        unit="học sinh"
                      />
                      <TooltipRow
                        color={CHART_COLORS.danger}
                        name="HS chênh lệch (HĐ − Thực tế)"
                        value={Number(row["HS chênh lệch"] ?? 0)}
                        unit="học sinh"
                      />
                    </TooltipBox>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="HS nghiệm thu" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} cursor="pointer" />
              <Bar dataKey="HS hợp đồng" fill={CHART_COLORS.dark} radius={[4, 4, 0, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Doanh thu theo khu vực" code="CH-B2B-03" isEmpty={data.byBranch.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
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
                    fill={cellFill(d.name, sel["branch"], BRANCH_COLORS[i % BRANCH_COLORS.length] ?? CHART_COLORS.primary)}
                  />
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
          <DonutLegend
            rows={data.byBranch}
            total={data.revenue}
            colorOf={(_r, i) => BRANCH_COLORS[i % BRANCH_COLORS.length] as string}
          />
        </Panel>

        <Panel
          title="Số lượng Cty & Trường"
          subtitle="Số khách hàng duy nhất theo nhóm, kèm tổng số HS trải nghiệm"
          code="CH-B2B-04"
          isEmpty={data.entitySummary.every((d) => d.value === 0)}
        >
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={data.entitySummary}
                dataKey="value"
                nameKey="name"
                innerRadius="52%"
                outerRadius="80%"
                paddingAngle={2}
                isAnimationActive={false}
                labelLine={false}
                label={renderInsideLabel}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("entity", d?.name)}
              >
                {data.entitySummary.map((d) => (
                  <Cell key={d.name} fill={segmentCellFill(d.name, sel["entity"])} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { name: string; value: number; students: number };
                  return (
                    <TooltipBox label={row.name}>
                      <TooltipRow name="Số lượng" value={row.value} unit="đơn vị" />
                      <TooltipRow name="HS trải nghiệm" value={row.students} unit="học sinh" />
                    </TooltipBox>
                  );
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-2 grid gap-1.5 text-xs">
            {data.entitySummary.map((d) => (
              <li
                key={d.name}
                className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-0.5 hover:bg-secondary/60"
                onClick={() => toggle("entity", d.name)}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: d.name === "Công ty" ? COMPANY_COLOR : CHART_COLORS.primary }}
                />
                <span className="text-muted-foreground">{d.name}</span>
                <span className="ml-auto font-medium tabular-nums">{formatNumber(d.value)} đơn vị</span>
                <span className="w-28 shrink-0 text-right text-muted-foreground">
                  {formatNumber(d.students)} HS
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Doanh thu theo cấp học" subtitle={"\n"} code="CH-B2B-05" isEmpty={data.bySegment.length === 0}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={data.bySegment}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
              onClick={(e: { activePayload?: { payload?: { name?: string } }[] }) =>
                toggle("level", e?.activePayload?.[0]?.payload?.name)
              }
              style={{ cursor: "pointer" }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
              <XAxis
                dataKey="name"
                {...axisProps}
                interval={0}
                height={44}
                tickFormatter={(v: string) => (v.length > 14 ? `${v.slice(0, 14)}…` : v)}
              />
              <YAxis {...axisProps} tickFormatter={shortLabel} width={60} />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { value: number; students: number };
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow
                        name="Doanh thu"
                        value={row.value}
                        share={data.revenue ? (row.value / data.revenue) * 100 : undefined}
                      />
                      <TooltipRow name="Số HS thực tế" value={row.students} unit="học sinh" />
                    </TooltipBox>
                  );
                }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} cursor="pointer">
                {data.bySegment.map((d) => (
                  <Cell key={d.name} fill={segmentCellFill(d.name, sel["level"])} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v: number) => formatShort(v)}
                  style={{ fontSize: 10, fill: CHART_COLORS.axis }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Tỷ lệ thu hồi công nợ B2B"
          subtitle={
            data.recoveryRate === null
              ? "Chưa đủ dữ liệu để tính chỉ số này."
              : `Thu hồi ${formatPercent(data.recoveryRate)} · Thực thu ${formatShort(data.collectedTotal)} · Công nợ ${formatShort(data.debt)}`
          }
          code="CH-B2B-06"
          isEmpty={data.recovery.length === 0}
        >
          <ResponsiveContainer width="100%" height={Math.min(180, Math.max(140, data.recovery.length * 26 + 34))}>
            <ComposedChart
              data={data.recovery}
              layout="vertical"
              margin={{ top: 8, right: 48, left: 8, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={shortLabel} />
              <YAxis
                type="category"
                dataKey="name"
                {...axisProps}
                width={110}
                tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 16)}…` : v)}
              />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { collected: number; debt: number; rate: number };
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow color={CHART_COLORS.primary} name="Thực thu" value={row.collected} />
                      <TooltipRow color={CHART_COLORS.danger} name="Công nợ" value={row.debt} />
                      <p className="mt-1 text-muted-foreground">Tỷ lệ thu hồi {formatPercent(row.rate)}</p>
                    </TooltipBox>
                  );
                }}
              />
              <Bar
                dataKey="collected"
                name="Thực thu"
                stackId="a"
                fill={CHART_COLORS.primary}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("branch", d?.name)}
              />
              <Bar
                dataKey="debt"
                name="Công nợ"
                stackId="a"
                fill={CHART_COLORS.danger}
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("branch", d?.name)}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel
          title="Top 10 khách hàng chi tiêu nhiều nhất"
          subtitle="Bấm vào khách hàng để lọc chéo toàn trang"
          code="CH-B2B-07"
          isEmpty={data.byCustomer.length === 0}
        >
          <ResponsiveContainer width="100%" height={Math.max(360, data.byCustomer.length * 38 + 40)}>
            <BarChart data={data.byCustomer} layout="vertical" margin={{ top: 8, right: 64, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
              <XAxis type="number" {...axisProps} tickFormatter={shortLabel} />
              <YAxis
                type="category"
                dataKey="name"
                {...axisProps}
                width={200}
                interval={0}
              />
              <Tooltip
                cursor={{ fill: "var(--secondary)" }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0]?.payload as { value: number; hopDong: number; nghiemThu: number };
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow
                        name="Doanh thu"
                        value={row.value}
                        share={data.revenue ? (row.value / data.revenue) * 100 : undefined}
                      />
                      <TooltipRow name="Số HS hợp đồng" value={row.hopDong} unit="học sinh" />
                      <TooltipRow name="Số HS nghiệm thu" value={row.nghiemThu} unit="học sinh" />
                    </TooltipBox>
                  );
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: { name?: string }) => toggle("customer", d?.name)}
              >
                {data.byCustomer.map((d) => (
                  <Cell
                    key={d.name}
                    fill={
                      d.segment === "Công ty"
                        ? sel["customer"] && sel["customer"] !== d.name
                          ? "var(--brand-support)"
                          : COMPANY_COLOR
                        : cellFill(d.name, sel["customer"], CHART_COLORS.primary)
                    }
                  />
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
          title="Đơn giá học sinh theo phân khúc"
          subtitle="Thống kê theo số Hợp đồng và BBNT"
          code="CH-B2B-08"
          isEmpty={data.priceBands.every((b) => b.bienBan === 0 && b.hopDong === 0)}
        >
          <ResponsiveContainer width="100%" height={Math.max(360, data.byCustomer.length * 38 + 40)}>
            <BarChart
              data={data.priceBands}
              margin={{ top: 16, right: 8, left: 0, bottom: 0 }}
              onClick={(e: { activePayload?: { payload?: { name?: string } }[] }) =>
                toggle("band", e?.activePayload?.[0]?.payload?.name)
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
                  const row = payload[0]?.payload as { bienBan: number; hopDong: number };
                  return (
                    <TooltipBox label={String(label)}>
                      <TooltipRow color={CHART_COLORS.primary} name="Số BBNT" value={row.bienBan} unit="biên bản" />
                      <TooltipRow color={CHART_COLORS.dark} name="Số Hợp đồng" value={row.hopDong} unit="hợp đồng" />
                    </TooltipBox>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="bienBan" name="Số BBNT" radius={[4, 4, 0, 0]} cursor="pointer">
                {data.priceBands.map((d) => (
                  <Cell key={d.name} fill={cellFill(d.name, sel["band"], CHART_COLORS.primary)} />
                ))}
                <LabelList dataKey="bienBan" position="top" style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
              </Bar>
              <Bar dataKey="hopDong" name="Số Hợp đồng" radius={[4, 4, 0, 0]} cursor="pointer">
                {data.priceBands.map((d) => (
                  <Cell key={d.name} fill={cellFill(d.name, sel["band"], CHART_COLORS.dark)} />
                ))}
                <LabelList dataKey="hopDong" position="top" style={{ fontSize: 10, fill: CHART_COLORS.axis }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel
        title="Số lần hợp tác của từng khách hàng"
        subtitle="Mỗi ô: số hợp đồng (duy nhất) · tổng số HS thực tế — sắp giảm dần theo tổng số hợp đồng, bấm 1 dòng để lọc chéo theo khách hàng đó"
        code="CH-B2B-09"
        isEmpty={data.heatmap.length === 0}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-muted-foreground">
                <th className="border border-border/60 px-2 py-1 text-left font-medium">Tên khách hàng</th>
                <th className="border border-border/60 px-2 py-1 text-left font-medium">Cấp học</th>
                {data.years.map((y) => (
                  <th key={y} className="border border-border/60 px-2 py-1 text-center font-medium">
                    {y}
                  </th>
                ))}
                <th className="border border-border/60 px-2 py-1 text-center font-medium">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {data.heatmap.map((r) => (
                <tr
                  key={r.name}
                  className="cursor-pointer hover:bg-secondary/60"
                  onClick={() => toggle("customer", r.name)}
                >
                  <td
                    className="max-w-[280px] truncate border border-border/60 px-2 py-1"
                    title={r.name}
                    style={
                      sel["customer"] === r.name
                        ? { background: "var(--secondary)" }
                        : r.segment === "Công ty"
                          ? { background: `color-mix(in oklab, ${COMPANY_COLOR} 35%, transparent)`, fontWeight: 600 }
                          : undefined
                    }
                  >
                    {r.name}
                  </td>
                  <td
                    className="border border-border/60 px-2 py-1"
                    style={
                      r.segment === "Công ty"
                        ? { background: `color-mix(in oklab, ${COMPANY_COLOR} 35%, transparent)`, fontWeight: 600 }
                        : undefined
                    }
                  >
                    {r.segment}
                  </td>
                  {r.cells.map((c) => (
                    <td
                      key={c.year}
                      title={`${r.name} · ${c.year}: ${c.count} hợp đồng, ${formatNumber(c.students)} HS thực tế`}
                      className="border border-border/60 px-2 py-1 text-center tabular-nums"
                      style={{
                        background:
                          c.count > 0
                            ? `color-mix(in oklab, ${HEATMAP_BLUE} ${Math.round((c.count / data.heatMax) * 70) + 10}%, transparent)`
                            : undefined,
                      }}
                    >
                      {c.count > 0 ? (
                        <>
                          {c.count} HĐ
                          <span className="block text-[10px] opacity-80">{formatNumber(c.students)} HS</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  ))}
                  <td className="border border-border/60 px-2 py-1 text-center font-semibold tabular-nums">
                    {r.total} HĐ
                    <span className="block text-[10px] font-normal opacity-80">
                      {formatNumber(r.totalStudents)} HS
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="Cơ cấu doanh thu Gross theo Tháng & Thứ"
        subtitle="Theo ngày trải nghiệm — bấm vào tháng để bung/gập các tuần (Tuần 1 = ngày 1–7, Tuần 2 = 8–14…)"
        code="CH-B2B-10"
        isEmpty={data.grossMonthWeekMatrix.length === 0}
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
              {data.grossMonthWeekMatrix.map((m) => {
                const open = openMonths[m.monthKey] ?? false;
                const tint = (v: number) =>
                  v > 0
                    ? `color-mix(in oklab, var(--primary) ${Math.round((v / data.grossMonthWeekMax) * 70) + 8}%, transparent)`
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

      <Panel title="🚩Chỉ số nổi bật" isEmpty={data.insights.length === 0}>
        <InsightList items={data.insights} />
      </Panel>

      <FactTable
        title="Bảng chi tiết biên bản nghiệm thu"
        subtitle={school ? `Đang lọc theo trường ${school}` : "Chọn cột hiển thị và xuất dữ liệu"}
        columns={columns}
        rows={sortedRows}
        fileName="b2b-bien-ban-nghiem-thu"
      />

      <TourSection />

      <CustomChartsSection dataset="b2b" />
    </DashboardShell>
  );
}
