import { useMemo, useState } from "react";

import { formatNumber } from "@/features/stemtown/lib/format";
import { findSlots, pad, parseHM, type SlotMode, type SlotParams, type SlotPeriod } from "@/features/stemtown/lib/slot-finder";
import { TOUR_RULES, addDays, type TourItem } from "@/features/stemtown/lib/tour-rules";

const CAP = TOUR_RULES.capacityWarn;
const MODES: { v: SlotMode; l: string }[] = [
  { v: "fit", l: "Đủ chỗ cho đoàn mới" },
  { v: "empty", l: "Trống hoàn toàn" },
  { v: "full", l: `Đang đầy ${CAP} HS` },
  { v: "over", l: "Đang vượt sức chứa" },
];
const PERIODS: { v: SlotPeriod; l: string }[] = [
  { v: "all", l: "Mọi khung giờ" },
  { v: "am", l: "Sáng, trước 12:00" },
  { v: "pm", l: "Chiều, từ 12:00" },
];
const field = "h-9 rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-primary";
const lab = "mb-1 block text-[11px] font-medium text-muted-foreground";

/** Tìm khung giờ nhận đoàn mới theo tải đồng thời — dùng TẤT CẢ lượt trong file, không bị bộ lọc ẩn. */
export function SlotFinder({ items, today, onPickDay }: { items: TourItem[]; today: string; onPickDay: (d: string) => void }) {
  const [form, setForm] = useState({
    from: today,
    to: addDays(today, 30),
    newHs: "50",
    duration: "120",
    period: "all" as SlotPeriod,
    mode: "fit" as SlotMode,
    open: "07:00",
    close: "18:00",
    includeUnknown: false,
  });
  const toParams = (f: typeof form): SlotParams => ({
    from: f.from,
    to: f.to,
    newHs: Math.max(0, Number(f.newHs) || 0),
    duration: Math.max(15, Number(f.duration) || 0),
    period: f.period,
    mode: f.mode,
    open: parseHM(f.open, 7),
    close: parseHM(f.close, 18),
    includeUnknown: f.includeUnknown,
  });
  const [applied, setApplied] = useState<SlotParams>(() => toParams(form));
  const res = useMemo(() => findSlots(items, applied), [items, applied]);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const fit = applied.mode === "fit" || applied.mode === "empty";

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <h2 className="text-sm font-semibold">Tìm khung giờ nhận đoàn mới</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Giới hạn {CAP} HS cùng lúc. Tính tất cả lượt đã ghi trong file, kể cả khi bộ lọc sale/công ty đang ẩn chúng.
      </p>
      <form
        className="mt-3 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(toParams(form));
        }}
      >
        <label><span className={lab}>Từ ngày</span><input type="date" className={field} value={form.from} onChange={(e) => set("from", e.target.value)} /></label>
        <label><span className={lab}>Đến ngày</span><input type="date" className={field} value={form.to} onChange={(e) => set("to", e.target.value)} /></label>
        <label><span className={lab}>HS đoàn mới</span><input type="number" min={0} className={`${field} w-24`} value={form.newHs} onChange={(e) => set("newHs", e.target.value)} /></label>
        <label><span className={lab}>Thời lượng (phút)</span><input type="number" min={15} step={15} className={`${field} w-28`} value={form.duration} onChange={(e) => set("duration", e.target.value)} /></label>
        <label>
          <span className={lab}>Buổi</span>
          <select className={field} value={form.period} onChange={(e) => set("period", e.target.value as SlotPeriod)}>
            {PERIODS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </label>
        <label>
          <span className={lab}>Lọc khung giờ</span>
          <select className={field} value={form.mode} onChange={(e) => set("mode", e.target.value as SlotMode)}>
            {MODES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
        </label>
        <label><span className={lab}>Giờ mở cửa</span><input type="time" className={field} value={form.open} onChange={(e) => set("open", e.target.value)} /></label>
        <label><span className={lab}>Giờ kết thúc</span><input type="time" className={field} value={form.close} onChange={(e) => set("close", e.target.value)} /></label>
        <button type="submit" className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">
          Tìm khung giờ
        </button>
      </form>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.includeUnknown} onChange={(e) => { set("includeUnknown", e.target.checked); setApplied((a) => ({ ...a, includeUnknown: e.target.checked })); }} />
        Hiện cả khung giờ thiếu dữ liệu để đối chiếu
      </label>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Giờ hoạt động tạm đặt {pad(applied.open)}–{pad(applied.close)}, có thể đổi. Lượt thiếu giờ kết thúc được đánh dấu cần xác nhận và tính từ giờ bắt đầu đến giờ đóng cửa. Ngày chưa ghi lịch chỉ là trống theo file, cần đối chiếu booking mới trước khi chốt.
      </p>
      <p className="mt-3 text-sm font-medium">
        {formatNumber(res.rows.length)} khung giờ phù hợp · {applied.duration} phút
        {res.skippedUnknown > 0 && (
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            ({formatNumber(res.skippedUnknown)} ngày có tour thiếu giờ đang ẩn, bật ô trên để xem)
          </span>
        )}
      </p>
      {res.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Không có khung giờ phù hợp trong khoảng đã chọn.</p>
      ) : (
        <div className="mt-2 max-h-[420px] overflow-auto rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-secondary text-left text-muted-foreground">
              <tr>
                {["Ngày", "Khung giờ", fit ? "Giờ bắt đầu có thể chọn" : "—", "HS đồng thời cao nhất", "Còn chỗ", "Sau nhận đoàn", "Đối chiếu"].map((h, i) => (
                  <th key={i} className="whitespace-nowrap px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {res.rows.map((r, i) => (
                <tr key={`${r.date}-${r.start}-${i}`} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2">
                    <button type="button" className="text-primary hover:underline" title="Xem ngày này trên lịch" onClick={() => onPickDay(r.date)}>
                      {r.date.slice(8, 10)}/{r.date.slice(5, 7)}/{r.date.slice(0, 4)}
                    </button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{pad(r.start)}–{pad(r.end)}</td>
                  <td className="whitespace-nowrap px-3 py-2 tabular-nums">{r.pickFrom === null ? "—" : `${pad(r.pickFrom)}–${pad(r.pickTo as number)}`}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(r.peak)}/{CAP}</td>
                  <td className="px-3 py-2 tabular-nums">{r.free < 0 ? `Vượt ${formatNumber(-r.free)} HS` : `${formatNumber(r.free)} HS`}</td>
                  <td className="px-3 py-2 tabular-nums">{r.after < 0 ? `Thiếu ${formatNumber(-r.after)} HS` : `${formatNumber(r.after)} HS`}</td>
                  <td className={`px-3 py-2 ${r.verified ? "" : "text-amber-700"}`}>{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
