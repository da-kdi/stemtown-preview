import { dataPeriod, type Filters, type TimeUnit } from "@/features/stemtown/lib/dashboard-data";

/* ------------------------------------------------------------------ */
/* So sánh kỳ (WoW / MoM / QoQ / YoY)                                  */
/* ------------------------------------------------------------------ */

export type CompareMode = "none" | "wow" | "mom" | "qoq" | "yoy";

export const COMPARE_LABEL: Record<CompareMode, string> = {
  none: "Không so sánh",
  wow: "WoW",
  mom: "MoM",
  qoq: "QoQ",
  yoy: "YoY",
};

export const COMPARE_FULL_LABEL: Record<CompareMode, string> = {
  none: "Không so sánh",
  wow: "So với tuần trước",
  mom: "So với tháng trước",
  qoq: "So với quý trước",
  yoy: "So với cùng kỳ năm trước",
};

/**
 * Chỉ cho phép so sánh khi đơn vị thời gian của biểu đồ khớp với kỳ so sánh
 * (tránh so sánh sai kỳ, ví dụ MoM trên trục ngày).
 */
export function availableCompareModes(unit: TimeUnit): CompareMode[] {
  switch (unit) {
    case "week":
      return ["wow"];
    case "month":
      return ["mom", "yoy"];
    case "quarter":
      return ["qoq", "yoy"];
    case "year":
      return ["yoy"];
    case "day":
    case "weekday":
    default:
      return [];
  }
}

export function isCompareValid(unit: TimeUnit, mode: CompareMode): boolean {
  return mode === "none" || availableCompareModes(unit).includes(mode);
}

export const COMPARE_HINT = "Chọn đơn vị Tuần/Tháng/Quý/Năm để bật so sánh kỳ.";

/** Trả về mã bucket của kỳ trước tương ứng, hoặc null nếu không hợp lệ. */
export function previousBucket(bucket: string, unit: TimeUnit, mode: CompareMode): string | null {
  if (!isCompareValid(unit, mode) || mode === "none") return null;

  if (unit === "week") {
    const iso = bucket.replace("Tuần ", "");
    const d = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() - 7);
    return `Tuần ${toISO(d)}`;
  }

  if (unit === "month") {
    const [y, m] = bucket.split("-").map(Number);
    if (!y || !m) return null;
    const lag = mode === "yoy" ? 12 : 1;
    const idx = y * 12 + (m - 1) - lag;
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  }

  if (unit === "quarter") {
    const [ys, qs] = bucket.split("-Q");
    const y = Number(ys);
    const q = Number(qs);
    if (!y || !q) return null;
    const lag = mode === "yoy" ? 4 : 1;
    const idx = y * 4 + (q - 1) - lag;
    return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
  }

  if (unit === "year") return String(Number(bucket) - 1);

  return null;
}

function toISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Bộ lọc giữ nguyên mọi tiêu chí nhưng mở rộng khoảng ngày ra toàn bộ dữ liệu. */
export function withFullPeriod(f: Filters): Filters {
  return { ...f, from: dataPeriod.from, to: dataPeriod.to };
}

const firstDayOfBucket = (bucket: string, unit: TimeUnit): string | null => {
  if (unit === "week") return bucket.replace("Tuần ", "");
  if (unit === "month") return `${bucket}-01`;
  if (unit === "quarter") {
    const [y, q] = bucket.split("-Q");
    if (!y || !q) return null;
    return `${y}-${String((Number(q) - 1) * 3 + 1).padStart(2, "0")}-01`;
  }
  if (unit === "year") return `${bucket}-01-01`;
  return null;
};

export type CompareResult = {
  prev: number | null;
  delta: number | null;
  /** Kỳ trước nằm ngoài phạm vi dữ liệu hiện có -> không đủ căn cứ so sánh. */
  reason: "ok" | "no-prev-data" | "invalid";
};

/**
 * Ghép giá trị kỳ trước vào từng điểm dữ liệu.
 * `fullMap` nên được tính trên toàn bộ dữ liệu (không giới hạn khoảng ngày)
 * để kỳ trước vẫn có số liệu khi nó nằm ngoài bộ lọc.
 */
export function compareOne(
  bucket: string,
  unit: TimeUnit,
  mode: CompareMode,
  fullMap: Map<string, number>,
): CompareResult {
  const prevKey = previousBucket(bucket, unit, mode);
  if (!prevKey) return { prev: null, delta: null, reason: "invalid" };

  const start = firstDayOfBucket(prevKey, unit);
  const withinData = start ? start >= dataPeriod.from.slice(0, 10) : false;
  const prev = fullMap.get(prevKey);

  if (prev === undefined || !withinData) return { prev: null, delta: null, reason: "no-prev-data" };
  return { prev, delta: null, reason: "ok" };
}

export function deltaPercent(current: number, prev: number | null): number | null {
  if (prev === null || prev === 0) return null;
  return ((current - prev) / prev) * 100;
}

/** Gắn `prev` + `delta` cho mảng điểm dữ liệu có trường `bucket`. */
export function attachCompare<T extends { bucket: string }>(
  rows: T[],
  currentValue: (r: T) => number,
  unit: TimeUnit,
  mode: CompareMode,
  fullMap: Map<string, number>,
): (T & { prev: number | null; delta: number | null })[] {
  return rows.map((r) => {
    const res = compareOne(r.bucket, unit, mode, fullMap);
    const prev = res.reason === "ok" ? res.prev : null;
    return { ...r, prev, delta: deltaPercent(currentValue(r), prev) };
  });
}
