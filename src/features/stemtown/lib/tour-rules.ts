import type { TourRow } from "@/features/stemtown/lib/dashboard-data";

/* ------------------------------------------------------------------ */
/* Quy tắc nghiệp vụ Lịch tour B2B                                      */
/* Mọi ngưỡng/giả định nằm ở đây — UI chỉ đọc, không tự định nghĩa.     */
/* Các giá trị đánh dấu TẠM THỜI đang chờ xác nhận chính thức.          */
/* ------------------------------------------------------------------ */

export const TOUR_RULES = {
  /** TẠM THỜI: cảnh báo khi >300 HS (sức chứa ước tính 300–350, chưa có số chính thức). */
  capacityWarn: 300,
  capacityRange: "300–350",
  /** Không có giờ kết thúc: bắt đầu trước 12h -> kết thúc 12:00, còn lại -> 17:00. */
  morningEnd: 12,
  afternoonEnd: 17,
  /** "Full ngày" = 8:00–17:00. */
  fullDay: [8, 17] as const,
  /** Trục giờ của timeline. */
  axis: [7, 18] as const,
  /** ±5% coi là "đứng yên" khi so sánh kỳ. */
  flatThreshold: 0.05,
  /** Giá vé >= 5tr coi là giá trọn gói (không phải giá/HS). */
  packagePriceMin: 5_000_000,
  sizeBins: [
    { max: 50, label: "≤50 HS" },
    { max: 150, label: "51–150" },
    { max: 300, label: "151–300" },
    { max: Number.POSITIVE_INFINITY, label: ">300" },
  ],
  /** TẠM THỜI: phân loại dòng theo từ khoá (nên bổ sung cột "Loại dòng" ở sheet gốc). */
  kindRules: {
    block: { time: /NGHỈ/i, school: /TEAM BUILDING|^BLOCK$|mượn/i },
    guest: { school: /KHÁCH MỜI|CBQL|BAN GIÁM HIỆU/i },
  },
  /** Tải vận hành (tab Lịch tour) tính cả HS khách mời; KPI thương mại chỉ tính tour. */
  opsLoadIncludesGuest: true,
} as const;

export type TourKind = "tour" | "guest" | "block";

export type TourItem = TourRow & {
  id: number;
  kind: TourKind;
  /** Giờ bắt đầu/kết thúc dạng số giờ thập phân (8.5 = 8:30); null nếu không đọc được khung giờ. */
  start: number | null;
  end: number | null;
  endAssumed: boolean;
  flags: string[];
};

/* ------------------------------ Ngày giờ ------------------------------ */

export const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

/** Hôm nay theo giờ Việt Nam, dạng yyyy-MM-dd. */
export function todayVN(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
}

const toUTC = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
};
export const addDays = (s: string, n: number) => {
  const t = toUTC(s);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
/** 0 = Thứ 2 ... 6 = Chủ nhật. */
export const weekdayIdx = (s: string) => (toUTC(s).getUTCDay() + 6) % 7;
export const mondayOf = (s: string) => addDays(s, -weekdayIdx(s));
export const addMonths = (m: string, n: number) => {
  let [y, mm] = m.split("-").map(Number) as [number, number];
  mm += n;
  while (mm > 12) { mm -= 12; y++; }
  while (mm < 1) { mm += 12; y--; }
  return `${y}-${String(mm).padStart(2, "0")}`;
};
export const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
export const monthLabel = (m: string) => `Tháng ${Number(m.slice(5, 7))}/${m.slice(0, 4)}`;
export const monthShort = (m: string, refYear?: string) =>
  refYear && m.slice(0, 4) === refYear ? `T${Number(m.slice(5, 7))}` : `T${Number(m.slice(5, 7))}/${m.slice(2, 4)}`;
export const hhmm = (h: number) => {
  const H = Math.floor(h);
  const M = Math.round((h - H) * 60);
  return `${H}:${String(M).padStart(2, "0")}`;
};
/** Các thứ Hai của những tuần giao với tháng m. */
export function weeksOfMonth(m: string): string[] {
  const first = `${m}-01`;
  const last = addDays(`${addMonths(m, 1)}-01`, -1);
  const out: string[] = [];
  for (let w = mondayOf(first); w <= last; w = addDays(w, 7)) out.push(w);
  return out;
}
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/* --------------------------- Chuẩn hoá dòng --------------------------- */

export function classifyTour(r: TourRow): TourKind {
  const R = TOUR_RULES.kindRules;
  if (R.block.time.test(r.timeRaw ?? "") || R.block.school.test(r.schoolName)) return "block";
  if (R.guest.school.test(r.schoolName)) return "guest";
  return "tour";
}

export function parseSlot(raw: string | null): { start: number; end: number; assumed: boolean } | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/full\s*ng[aà]y/i.test(s) || /NGHỈ/i.test(s))
    return { start: TOUR_RULES.fullDay[0], end: TOUR_RULES.fullDay[1], assumed: false };
  const t = Array.from(s.matchAll(/(\d{1,2})\s*[:hH]\s*(\d{2})/g)).map((m) => Number(m[1]) + Number(m[2]) / 60);
  if (!t.length) return null;
  const start = t[0] as number;
  let end = t[1];
  let assumed = false;
  if (end === undefined || end <= start) {
    end = start < TOUR_RULES.morningEnd ? TOUR_RULES.morningEnd : TOUR_RULES.afternoonEnd;
    assumed = true;
  }
  return { start, end, assumed };
}

export function enrichTours(rows: TourRow[], today: string): TourItem[] {
  return rows.map((r, i) => {
    const kind = classifyTour(r);
    const slot = parseSlot(r.timeRaw);
    const flags: string[] = [];
    if (slot?.assumed) flags.push(`Không có giờ kết thúc, áp rule ${hhmm(slot.end)}`);
    if (kind === "tour") {
      if (r.price >= TOUR_RULES.packagePriceMin) flags.push("Giá trọn gói, làm lệch HS và giá mỗi HS");
      else if (!r.price) flags.push("Giá vé 0đ hoặc trống");
      if (!r.revenue && r.price) flags.push("Thiếu DT dự kiến");
      if (r.price && r.revenue && r.price < TOUR_RULES.packagePriceMin && Math.abs(r.students * r.price - r.revenue) > 1)
        flags.push("DT dự kiến ≠ SL × giá");
      if (r.date && r.date < today && r.status === "Chưa xác định") flags.push("Đã qua ngày, chưa cập nhật tiến độ");
      if (!r.date && r.status === "Done") flags.push("Tiến độ Done nhưng chưa có ngày");
      if (r.students > TOUR_RULES.capacityWarn) flags.push(`Đoàn >${TOUR_RULES.capacityWarn} HS`);
    }
    return { ...r, id: i, kind, start: slot?.start ?? null, end: slot?.end ?? null, endAssumed: slot?.assumed ?? false, flags };
  });
}

/* ------------------------------ Metrics ------------------------------- */

export type TourAgg = { n: number; hs: number; dt: number; size: number | null; price: number | null };

/** Doanh thu dự kiến = Số tour × HS mỗi tour × Giá mỗi HS (đồng nhất tuyệt đối theo định nghĩa). */
export function aggTours(list: TourItem[]): TourAgg {
  const n = list.length;
  const hs = list.reduce((a, r) => a + r.students, 0);
  const dt = list.reduce((a, r) => a + r.revenue, 0);
  return { n, hs, dt, size: n ? hs / n : null, price: hs ? dt / hs : null };
}

/** Phạm vi thương mại: chỉ tour (không khách mời/sự kiện), đã có ngày, lọc theo sale. */
export function commercialTours(items: TourItem[], sale: string) {
  return items.filter((r) => r.kind === "tour" && r.hasDate && (!sale || r.sale === sale));
}

export function monthAgg(items: TourItem[], m: string, sale: string): TourAgg {
  return aggTours(commercialTours(items, sale).filter((r) => r.month === m));
}

export type CompareMode = "prev" | "avg3";
export function baseAgg(items: TourItem[], m: string, mode: CompareMode, sale: string, refYear: string): TourAgg & { label: string } {
  if (mode === "prev") return { ...monthAgg(items, addMonths(m, -1), sale), label: monthShort(addMonths(m, -1), refYear) };
  const ms = [1, 2, 3].map((i) => addMonths(m, -i));
  const a = ms.map((x) => monthAgg(items, x, sale));
  const n = a.reduce((s, x) => s + x.n, 0) / 3;
  const hs = a.reduce((s, x) => s + x.hs, 0) / 3;
  const dt = a.reduce((s, x) => s + x.dt, 0) / 3;
  return { n, hs, dt, size: n ? hs / n : null, price: hs ? dt / hs : null, label: `TB ${ms.slice().reverse().map((x) => monthShort(x, refYear)).join(", ")}` };
}

export const delta = (cur: number | null, base: number | null) =>
  cur === null || base === null || !Number.isFinite(base) || base === 0 ? null : (cur - base) / base;

export type Dir = "up" | "down" | "flat";
export const direction = (d: number | null): Dir | null =>
  d === null ? null : d > TOUR_RULES.flatThreshold ? "up" : d < -TOUR_RULES.flatThreshold ? "down" : "flat";

/* ---------------------------- Tải theo ngày --------------------------- */

export type DayInfo = { items: TourItem[]; load: number; tours: number; hasOther: boolean; peak: number };

export function dayInfo(items: TourItem[], d: string): DayInfo {
  const list = items.filter((r) => r.date === d);
  const inLoad = (r: TourItem) => r.kind === "tour" || (TOUR_RULES.opsLoadIncludesGuest && r.kind === "guest");
  const load = list.filter(inLoad).reduce((a, r) => a + r.students, 0);
  const ev: [number, number][] = [];
  list.filter((r) => inLoad(r) && r.start !== null && r.end !== null && r.students > 0).forEach((r) => {
    ev.push([r.start as number, r.students]);
    ev.push([r.end as number, -r.students]);
  });
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let cur = 0;
  let peak = 0;
  for (const e of ev) {
    cur += e[1];
    peak = Math.max(peak, cur);
  }
  return { items: list, load, tours: list.filter((r) => r.kind === "tour").length, hasOther: list.some((r) => r.kind !== "tour"), peak };
}
