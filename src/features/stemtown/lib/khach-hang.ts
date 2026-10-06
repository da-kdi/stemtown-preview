import overrideRaw from "@/features/stemtown/data/khachhang-loai.json";

export type KhachLoai = "company" | "school";

/** Bảng ghi đè thủ công: key = tên khách hàng viết HOA (đúng như cột TenKhachHang), value = "company" | "school". */
const OVERRIDE = overrideRaw as Record<string, KhachLoai>;

/** Bỏ dấu + hạ chữ thường để so khớp từ khóa. */
export const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

const COMPANY_RE = /(^|[^a-z0-9])(cong ty|cty|tnhh|co phan|tap doan|jsc)([^a-z0-9]|$)/;

/** Công ty hay Trường: ưu tiên bảng ghi đè, sau đó theo từ khóa (công ty, cty, tnhh, cổ phần, tập đoàn, jsc). */
export function isCompanyName(name: string): boolean {
  const key = name.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim().toUpperCase();
  const o = OVERRIDE[key];
  if (o) return o === "company";
  return COMPANY_RE.test(fold(name));
}
