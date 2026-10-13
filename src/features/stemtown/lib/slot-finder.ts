import { TOUR_RULES, addDays, type TourItem } from "@/features/stemtown/lib/tour-rules";

export type SlotMode = "fit" | "empty" | "full" | "over";
export type SlotPeriod = "all" | "am" | "pm";
export type SlotParams = {
  from: string;
  to: string;
  newHs: number;
  /** Thời lượng đoàn mới (phút). */
  duration: number;
  period: SlotPeriod;
  mode: SlotMode;
  /** Giờ mở/đóng cửa dạng số giờ thập phân (7 = 07:00). */
  open: number;
  close: number;
  includeUnknown: boolean;
};
export type SlotRow = {
  date: string;
  start: number;
  end: number;
  /** Khoảng giờ bắt đầu có thể chọn (chỉ có khi tìm chỗ cho đoàn mới). */
  pickFrom: number | null;
  pickTo: number | null;
  peak: number;
  free: number;
  after: number;
  note: string;
  verified: boolean;
};
export type SlotResult = { rows: SlotRow[]; skippedUnknown: number; days: number };

export const pad = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
export const parseHM = (s: string, fallback: number) => {
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  return m ? Number(m[1]) + Number(m[2]) / 60 : fallback;
};

const MAX_DAYS = 400;

/**
 * Tìm khung giờ theo tải đồng thời (sweep-line). Tính TẤT CẢ lượt đã ghi trong file (không phụ thuộc bộ lọc sale/công ty).
 * Lượt thiếu giờ kết thúc được coi là chiếm từ giờ bắt đầu đến giờ đóng cửa (cần xác nhận).
 * Lượt không đọc được giờ bắt đầu không xếp được vào trục giờ: ngày có lượt đó chỉ hiện khi bật "hiện cả khung giờ thiếu dữ liệu".
 */
export function findSlots(items: TourItem[], p: SlotParams): SlotResult {
  const cap = TOUR_RULES.capacityWarn;
  const lo = p.period === "pm" ? Math.max(12, p.open) : p.open;
  const hi = p.period === "am" ? Math.min(12, p.close) : p.close;
  const rows: SlotRow[] = [];
  let skippedUnknown = 0;
  let days = 0;
  if (!p.from || !p.to || hi <= lo) return { rows, skippedUnknown, days };

  const byDay = new Map<string, TourItem[]>();
  items.forEach((r) => {
    if (!r.date || r.kind === "block") return;
    const arr = byDay.get(r.date);
    if (arr) arr.push(r);
    else byDay.set(r.date, [r]);
  });

  const need = (p.mode === "fit" || p.mode === "empty" ? p.duration : 1) / 60;
  const ok = (load: number) =>
    p.mode === "fit" ? load + p.newHs <= cap : p.mode === "empty" ? load === 0 : p.mode === "full" ? load === cap : load > cap;

  for (let d = p.from, n = 0; d <= p.to && n < MAX_DAYS; d = addDays(d, 1), n++) {
    days++;
    const list = byDay.get(d) ?? [];
    const unknown = list.filter((r) => r.start === null);
    if (unknown.length && !p.includeUnknown) {
      skippedUnknown++;
      continue;
    }
    const placed = list
      .filter((r) => r.start !== null)
      .map((r) => ({ s: r.start as number, e: r.endAssumed ? p.close : (r.end as number), hs: r.students, assumed: r.endAssumed }))
      .filter((r) => r.e > r.s && r.hs > 0);
    const cuts = Array.from(new Set([lo, hi, ...placed.flatMap((r) => [r.s, r.e]).filter((x) => x > lo && x < hi)])).sort((a, b) => a - b);
    const segs = cuts.slice(0, -1).map((s, i) => {
      const e = cuts[i + 1] as number;
      return { s, e, load: placed.filter((r) => r.s <= s && r.e >= e).reduce((a, r) => a + r.hs, 0) };
    });
    const wins: { s: number; e: number; peak: number }[] = [];
    segs.forEach((g) => {
      if (!ok(g.load)) return;
      const last = wins[wins.length - 1];
      if (last && last.e === g.s) {
        last.e = g.e;
        last.peak = Math.max(last.peak, g.load);
      } else wins.push({ s: g.s, e: g.e, peak: g.load });
    });
    const note = !list.length
      ? "Chưa ghi nhận lịch, cần đối chiếu"
      : unknown.length
        ? "Có tour thiếu giờ, chưa tính vào tải — cần đối chiếu"
        : placed.some((r) => r.assumed)
          ? "Có tour thiếu giờ kết thúc, tính đến giờ đóng cửa — cần xác nhận"
          : "Theo lịch giờ đã ghi";
    wins
      .filter((w) => w.e - w.s >= need - 1e-9)
      .forEach((w) =>
        rows.push({
          date: d,
          start: w.s,
          end: w.e,
          pickFrom: p.mode === "fit" || p.mode === "empty" ? w.s : null,
          pickTo: p.mode === "fit" || p.mode === "empty" ? w.e - p.duration / 60 : null,
          peak: w.peak,
          free: cap - w.peak,
          after: cap - w.peak - p.newHs,
          note,
          verified: list.length > 0 && !unknown.length && !placed.some((r) => r.assumed),
        }),
      );
  }
  return { rows, skippedUnknown, days };
}
