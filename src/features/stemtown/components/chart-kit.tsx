import type { ReactNode } from "react";

import { formatCurrency, formatNumber, formatPercent, formatShort } from "@/features/stemtown/lib/format";

export const CHART_COLORS = {
  primary: "var(--primary)",
  dark: "var(--brand-dark)",
  support: "var(--brand-support)",
  accent: "var(--brand-accent)",
  danger: "var(--destructive)",
  grid: "var(--border)",
  axis: "var(--muted-foreground)",
};

export const DONUT_COLORS = [
  "var(--primary)",
  "var(--brand-accent)",
  "var(--brand-support)",
  "var(--brand-dark)",
  "var(--chart-5)",
];

/**
 * Màu theo DANH MỤC SẢN PHẨM — dùng CHUNG cho mọi chart để 1 danh mục luôn cùng 1 màu
 * ở khắp nơi. Bảng màu tránh đen/quá tối. Danh mục đã biết có màu cố định theo thứ tự;
 * danh mục lạ được gán màu ổn định theo hash tên (không bao giờ ra đen).
 */
export const CATEGORY_PALETTE = [
  "oklch(0.78 0.11 235)", // Vé Học sinh — xanh blue nhạt
  "oklch(0.72 0.16 45)", //  Vé Phụ huynh — cam
  "oklch(0.70 0.13 155)", // Khoá học STEM — xanh lá
  "oklch(0.66 0.16 300)", // Quà tặng — tím
  "oklch(0.78 0.12 195)", // Thẻ thành viên — xanh ngọc
  "oklch(0.68 0.17 20)", //  Hàng bán — đỏ san hô
  "oklch(0.75 0.14 95)", //  Vé đoàn — vàng olive
  "oklch(0.70 0.13 330)", // Membership — hồng
  "oklch(0.60 0.12 265)", // dự phòng — chàm
  "oklch(0.72 0.10 140)", // dự phòng — xanh rêu
];

const CATEGORY_ORDER = [
  "Vé Học sinh",
  "Vé Phụ huynh",
  "Khoá học STEM",
  "Quà tặng",
  "Thẻ thành viên",
  "Hàng bán",
  "Vé đoàn",
  "Membership",
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Màu cố định cho một danh mục sản phẩm (dùng ở mọi chart). */
export function categoryColor(name: string): string {
  const known = CATEGORY_ORDER.indexOf(name);
  const idx = known >= 0 ? known : CATEGORY_ORDER.length + (hashStr(name) % (CATEGORY_PALETTE.length - CATEGORY_ORDER.length || 1));
  return CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] as string;
}

/** Màu ĐỎ ĐÔ dành riêng cho dòng "Tổng" và "Chỉ số nổi bật" — không trùng danh mục nào. */
export const TOTAL_COLOR = "oklch(0.47 0.17 25)";

export const axisProps = {
  tick: { fontSize: 11, fill: CHART_COLORS.axis },
  tickLine: false,
  axisLine: false,
};

export function TooltipBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold">{label}</p>
      {children}
    </div>
  );
}

export function TooltipRow({
  color,
  name,
  value,
  share,
  unit = "đ",
}: {
  color?: string | undefined;
  name: string;
  value: number;
  share?: number | undefined;
  unit?: string | undefined;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color && <span className="size-2 rounded-full" style={{ background: color }} />}
      <span className="text-muted-foreground">{name}</span>
      <span className="ml-auto font-medium tabular-nums">
        {unit === "đ" ? formatCurrency(value) : `${formatNumber(value, 0)} ${unit}`}
      </span>
      {share !== undefined && Number.isFinite(share) && (
        <span className="text-muted-foreground">({formatPercent(share)})</span>
      )}
    </div>
  );
}

/** Dòng "so với Target" trong tooltip chart theo thời gian — target đã chia đều theo ngày cho
 *  đúng bucket đang hover. Luôn hiện 🔺 (không phân biệt đạt/chưa đạt target, theo yêu cầu).
 *  `null`/không có target cho bucket này -> không hiện gì cả. */
export function TargetRow({
  actual,
  target,
  format = formatCurrency,
}: {
  actual: number;
  target: number | null;
  format?: (n: number) => string;
}) {
  if (target === null || target <= 0) return null;
  const pct = (actual / target) * 100;
  return (
    <div className="mt-1 border-t border-dashed border-border pt-1">
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-muted-foreground">Target</span>
        <span className="ml-auto font-medium tabular-nums">{format(target)}</span>
      </div>
      <div className="flex items-center gap-2 py-0.5">
        <span className="text-muted-foreground">% đạt Target</span>
        <span className="ml-auto font-semibold tabular-nums">{`🔺 ${formatPercent(pct)}`}</span>
      </div>
    </div>
  );
}

export const shortLabel = (v: number) => formatShort(v);

/** Nhãn % vẽ bên trong lát donut để không bị cắt ở mép chart. */
/** Tick trục danh mục (tên nhân viên, tên CTKM...) — viết đầy đủ, tự xuống dòng tối đa 2 dòng
 *  thay vì cắt "…" giữa chừng, để không che mất tên. */
export function wrapTickLines(text: string, maxCharsPerLine = 16, maxLines = 2): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (test.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const shown = lines.slice(0, maxLines);
    shown[maxLines - 1] = `${shown[maxLines - 1]}…`;
    return shown;
  }
  return lines;
}

/** Tick component cho trục X danh mục (nằm ngang dưới chart) — text căn giữa, tối đa 2 dòng. */
export function XCategoryTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
  const lines = wrapTickLines(String(payload.value ?? ""), 14, 2);
  return (
    <text x={x} y={y + 4} textAnchor="middle" fontSize={10} fill={CHART_COLORS.axis}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 10 : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Tick component cho trục Y danh mục (bar ngang) — text căn phải, tối đa 2 dòng. */
export function YCategoryTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
  const lines = wrapTickLines(String(payload.value ?? ""), 22, 2);
  const startDy = lines.length > 1 ? -5 : 4;
  return (
    <text x={x} y={y} textAnchor="end" fontSize={10} fill={CHART_COLORS.axis}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : 12}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

export function renderInsideLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  percent?: number;
}) {
  const { cx = 0, cy = 0, midAngle = 0, innerRadius = 0, outerRadius = 0, percent = 0 } = props;
  if (percent < 0.04) return null;
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const rad = (-midAngle * Math.PI) / 180;
  return (
    <text
      x={cx + radius * Math.cos(rad)}
      y={cy + radius * Math.sin(rad)}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={11}
      fontWeight={600}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
}

export function DonutLegend({
  rows,
  total,
  unit = "đ",
  colorOf,
}: {
  rows: { name: string; value: number }[];
  total: number;
  unit?: string;
  /** Màu chấm tròn theo từng dòng — TRUYỀN VÀO khi pie dùng bảng màu riêng (khác DONUT_COLORS
   *  mặc định), để chấm màu trong legend luôn khớp đúng lát cắt trên pie. Mặc định: DONUT_COLORS. */
  colorOf?: (row: { name: string; value: number }, index: number) => string;
}) {
  const swatchColor = colorOf ?? ((_r, i) => DONUT_COLORS[i % DONUT_COLORS.length] as string);
  return (
    <ul className="mt-2 grid gap-1.5">
      {rows.map((r, i) => (
        <li key={r.name} className="flex items-center gap-2 text-xs" title={r.name}>
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ background: swatchColor(r, i) }}
          />
          <span className="truncate text-muted-foreground">{r.name}</span>
          <span className="ml-auto shrink-0 font-medium tabular-nums">
            {unit === "đ" ? formatShort(r.value) : formatNumber(r.value)}
          </span>
          <span className="w-14 shrink-0 text-right text-muted-foreground">
            {total ? formatPercent((r.value / total) * 100) : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
