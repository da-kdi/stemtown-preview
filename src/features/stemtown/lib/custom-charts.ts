import { supabase } from "@/integrations/supabase/client";

import { b2bRows, b2cRows, isValidB2B, type B2BRow, type B2CRow } from "@/features/stemtown/lib/dashboard-data";

export type Dataset = "b2c" | "b2b";
export type ChartType = "bar" | "hbar" | "line" | "area" | "pie";

export const CHART_TYPES: { value: ChartType; label: string }[] = [
  { value: "bar", label: "Cột dọc" },
  { value: "hbar", label: "Cột ngang" },
  { value: "line", label: "Đường" },
  { value: "area", label: "Vùng" },
  { value: "pie", label: "Tròn (donut)" },
];

export type StemtownChart = {
  id: string;
  title: string;
  description: string | null;
  dataset: Dataset;
  dimension: string;
  measure: string;
  chart_type: ChartType;
  sort_order: number;
  is_active: boolean;
};

/** Các "chiều" (group by) cho mỗi tập dữ liệu. */
export const DIMENSIONS: Record<Dataset, { key: string; label: string; get: (r: never) => string }[]> = {
  b2c: [
    { key: "category", label: "Danh mục sản phẩm", get: (r: B2CRow) => r.category },
    { key: "branch", label: "Chi nhánh", get: (r: B2CRow) => r.branch },
    { key: "source", label: "Nguồn đơn hàng", get: (r: B2CRow) => r.source },
    { key: "productGroup", label: "Nhóm sản phẩm", get: (r: B2CRow) => r.productGroup },
    { key: "staffName", label: "Nhân viên tạo đơn", get: (r: B2CRow) => r.staffName ?? "—" },
    { key: "month", label: "Tháng", get: (r: B2CRow) => r.date.slice(0, 7) },
  ] as { key: string; label: string; get: (r: never) => string }[],
  b2b: [
    { key: "branch", label: "Chi nhánh", get: (r: B2BRow) => r.branch },
    { key: "level", label: "Cấp học", get: (r: B2BRow) => r.level },
    { key: "district", label: "Quận/Khu vực", get: (r: B2BRow) => r.district },
    { key: "schoolName", label: "Trường", get: (r: B2BRow) => r.schoolName },
    { key: "month", label: "Tháng", get: (r: B2BRow) => r.date.slice(0, 7) },
  ] as { key: string; label: string; get: (r: never) => string }[],
};

/** Các "số đo" cho mỗi tập dữ liệu. unit "đ" -> tiền, "num" -> số lượng. */
export const MEASURES: Record<
  Dataset,
  { key: string; label: string; unit: "đ" | "num"; get: (r: never) => number }[]
> = {
  b2c: [
    { key: "revenue", label: "Doanh thu", unit: "đ", get: (r: B2CRow) => r.revenue },
    { key: "quantity", label: "Số lượng sản phẩm", unit: "num", get: (r: B2CRow) => r.quantity },
    { key: "orderCount", label: "Số đơn hàng", unit: "num", get: (r: B2CRow) => r.orderCount },
    { key: "discount", label: "Tiền khuyến mãi", unit: "đ", get: (r: B2CRow) => r.discount },
    { key: "count", label: "Số dòng đơn", unit: "num", get: (_r: B2CRow) => 1 },
  ] as { key: string; label: string; unit: "đ" | "num"; get: (r: never) => number }[],
  b2b: [
    { key: "revenueNet", label: "Doanh thu net", unit: "đ", get: (r: B2BRow) => r.revenueNet },
    { key: "revenueGross", label: "Doanh thu gross", unit: "đ", get: (r: B2BRow) => r.revenueGross },
    { key: "collected", label: "Đã thu", unit: "đ", get: (r: B2BRow) => r.collected },
    { key: "debt", label: "Công nợ", unit: "đ", get: (r: B2BRow) => r.debt },
    { key: "students", label: "Số học sinh", unit: "num", get: (r: B2BRow) => r.students },
    { key: "count", label: "Số biên bản", unit: "num", get: (_r: B2BRow) => 1 },
  ] as { key: string; label: string; unit: "đ" | "num"; get: (r: never) => number }[],
};

export function measureUnit(dataset: Dataset, measure: string): "đ" | "num" {
  return MEASURES[dataset].find((m) => m.key === measure)?.unit ?? "num";
}

/** Tổng hợp dữ liệu cho 1 biểu đồ tùy chỉnh từ dữ liệu hiện đang nạp. */
export function aggregateChart(cfg: {
  dataset: Dataset;
  dimension: string;
  measure: string;
  chart_type: ChartType;
}): { name: string; value: number }[] {
  const dim = DIMENSIONS[cfg.dataset].find((d) => d.key === cfg.dimension);
  const meas = MEASURES[cfg.dataset].find((m) => m.key === cfg.measure);
  if (!dim || !meas) return [];

  const rows: unknown[] = cfg.dataset === "b2c" ? b2cRows : b2bRows.filter(isValidB2B);
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = (dim.get(r as never) || "—") as string;
    map.set(key, (map.get(key) ?? 0) + (meas.get(r as never) as number));
  }
  let arr = [...map.entries()].map(([name, value]) => ({ name, value }));
  if (cfg.dimension === "month") arr.sort((a, b) => a.name.localeCompare(b.name));
  else arr.sort((a, b) => b.value - a.value);
  return arr.slice(0, cfg.chart_type === "pie" ? 8 : 20);
}

/* ------------------------- Lưu trữ (Supabase) ------------------------- */
// Bảng stemtown_charts chưa nằm trong types.ts sinh tự động -> cast client cho gọn.
type LooseDb = { from: (table: string) => { [k: string]: (...args: unknown[]) => unknown } };
const db = supabase as unknown as LooseDb;

export async function listCharts(): Promise<StemtownChart[]> {
  const q = db.from("stemtown_charts") as unknown as {
    select: (s: string) => { order: (c: string, o?: unknown) => Promise<{ data: unknown; error: unknown }> };
  };
  const { data, error } = await q.select("*").order("sort_order", { ascending: true });
  if (error) throw error as Error;
  return (data ?? []) as StemtownChart[];
}

export async function createChart(c: Omit<StemtownChart, "id">): Promise<void> {
  const q = db.from("stemtown_charts") as unknown as {
    insert: (v: unknown) => Promise<{ error: unknown }>;
  };
  const { error } = await q.insert(c);
  if (error) throw error as Error;
}

export async function updateChart(id: string, c: Partial<Omit<StemtownChart, "id">>): Promise<void> {
  const q = db.from("stemtown_charts") as unknown as {
    update: (v: unknown) => { eq: (col: string, val: string) => Promise<{ error: unknown }> };
  };
  const { error } = await q.update(c).eq("id", id);
  if (error) throw error as Error;
}

export async function deleteChart(id: string): Promise<void> {
  const q = db.from("stemtown_charts") as unknown as {
    delete: () => { eq: (c: string, v: string) => Promise<{ error: unknown }> };
  };
  const { error } = await q.delete().eq("id", id);
  if (error) throw error as Error;
}
