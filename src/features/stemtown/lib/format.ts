const nf = new Intl.NumberFormat("vi-VN");

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatCurrency(value: number): string {
  return `${nf.format(Math.round(value))} đ`;
}

/** Rút gọn số lớn, 1 chữ số thập phân (chuẩn data label). */
export function formatShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${formatNumber(value / 1_000_000_000, 1)} tỷ`;
  if (abs >= 1_000_000) return `${formatNumber(value / 1_000_000, 1)} tr`;
  if (abs >= 1_000) return `${formatNumber(value / 1_000, 1)} k`;
  return formatNumber(value, abs % 1 === 0 ? 0 : 1);
}

export function formatPercent(value: number, digits = 1): string {
  return `${formatNumber(value, digits)}%`;
}

/** Rút gọn số tiền kiểu "640tr"/"1,2tỷ" (không khoảng trắng trước đơn vị) — dùng hiển thị target ngắn gọn. */
export function formatTargetShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) {
    const n = value / 1_000_000_000;
    return `${formatNumber(n, Number.isInteger(n) ? 0 : 1)}tỷ`;
  }
  if (abs >= 1_000_000) {
    const n = value / 1_000_000;
    return `${formatNumber(n, Number.isInteger(n) ? 0 : 1)}tr`;
  }
  return formatCurrency(value);
}

export function maskCustomerName(name: string | null, phone: string | null): string {
  if (name && name.trim()) return name.trim();
  if (phone) return `KH ${phone.slice(-4)}`;
  return "Không xác định";
}
