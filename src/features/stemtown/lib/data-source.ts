import { supabase } from "@/integrations/supabase/client";

import {
  recomputeDerived,
  replaceB2CRows,
  setB2BBase,
  setKpiBase,
} from "@/features/stemtown/lib/dashboard-data";

export type StemtownRaw = {
  b2c: Record<string, unknown>[];
  b2b: Record<string, unknown>[];
  /** Sheet "KPI" (target doanh thu theo tháng) — có thể chưa có ở bản Apps Script cũ, mặc định []. */
  kpi?: Record<string, unknown>[];
};

/**
 * Gọi Edge Function `stemtown-data` (proxy đọc Google Sheet, chỉ trả cho người đã
 * đăng nhập). Trả về dữ liệu thô 2 tab để chuẩn hoá phía client.
 */
export async function fetchStemtownData(): Promise<StemtownRaw> {
  const { data, error } = await supabase.functions.invoke<StemtownRaw>("stemtown-data");
  if (error) throw new Error(error.message || "Không gọi được stemtown-data");
  if (
    !data ||
    typeof data !== "object" ||
    !Array.isArray((data as StemtownRaw).b2c) ||
    !Array.isArray((data as StemtownRaw).b2b)
  ) {
    const maybeErr = (data as { error?: string } | null)?.error;
    throw new Error(maybeErr || "Dữ liệu STEM TOWN trả về không hợp lệ");
  }
  return data as StemtownRaw;
}

/**
 * Nạp data Sheet vào store của module và tính lại các giá trị dẫn xuất.
 * Gọi trong queryFn TRƯỚC khi render dashboard để bộ lọc mặc định / danh sách chi
 * nhánh khớp với data thật.
 */
export async function loadStemtownData(): Promise<{ b2c: number; b2b: number }> {
  const { b2c, b2b, kpi } = await fetchStemtownData();
  replaceB2CRows(b2c);
  setB2BBase(b2b);
  setKpiBase(kpi ?? null);
  recomputeDerived();
  return { b2c: b2c.length, b2b: b2b.length };
}
