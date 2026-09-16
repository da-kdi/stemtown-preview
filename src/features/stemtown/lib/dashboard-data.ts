import rawB2C from "@/features/stemtown/data/b2c.json";
import rawB2B from "@/features/stemtown/data/b2b.json";
import type { SubMetric } from "@/features/stemtown/components/kpi";
import { formatPercent, formatTargetShort } from "@/features/stemtown/lib/format";

/* ------------------------------------------------------------------ */
/* Danh mục sản phẩm chuẩn hoá                                         */
/* ------------------------------------------------------------------ */

export const PRODUCT_CATEGORIES = [
  "Vé Học sinh",
  "Vé Phụ huynh",
  "Khóa học STEM",
  "Membership",
  "Hàng bán",
  "Vé đoàn",
  "SP không tính doanh thu",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export function normalizeCategory(productName: string | null | undefined): ProductCategory {
  const name = (productName ?? "").toLowerCase();
  if (!name) return "SP không tính doanh thu";
  if (name.includes("đoàn")) return "Vé đoàn";
  if (name.includes("học sinh")) return "Vé Học sinh";
  if (name.includes("phụ huynh") || name.includes("ph đi kèm")) return "Vé Phụ huynh";
  if (name.includes("vé")) return "Vé Học sinh";
  if (name.includes("khoá học") || name.includes("khóa học")) return "Khóa học STEM";
  if (name.includes("thành viên") || name.includes("member")) return "Membership";
  return "Hàng bán";
}

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type B2CRow = {
  date: string;
  customerName: string | null;
  phone: string | null;
  orderCode: string;
  source: string;
  productName: string;
  productType: string;
  productGroup: string;
  category: string;
  branch: string;
  staffName: string | null;
  staffPhone: string | null;
  /** Nhân viên phụ trách (cột "Tên nhân viên phụ trách") — dùng cho phân tích theo NV,
   *  KHÁC với staffName (nhân viên tạo đơn). "N/A" trong sheet -> null (chưa gán). */
  assignedStaff: string | null;
  /** Mã/tên chương trình khuyến mãi (cột "MaKhuyenMai"). Các giá trị coi là "không có KM"
   *  ("Không có CTKM", "Không tùy chỉnh", rỗng, "0", "N/A") đã được chuẩn hoá về null. */
  promoCode: string | null;
  quantity: number;
  discountRaw: number;
  discount: number;
  revenue: number;
  unitPrice: number;
  orderCount: number;
  branchCode: string;
  /** SĐT khách trùng SĐT nhân viên tạo đơn -> loại khỏi bảng xếp hạng khách hàng */
  isStaffPhone: boolean;
};

export type B2BRow = {
  bienBanId: string;
  status: string;
  statusCode: number;
  schoolIdCon: string;
  branch: string;
  district: string;
  schoolKey: string;
  schoolName: string;
  level: string;
  contract: string;
  students: number;
  /** Số HS theo hợp đồng (cột SoHSHopDong) — dùng cho chart "HS nghiệm thu vs Hợp đồng" theo thời gian */
  soHSHopDong: number;
  revenueGross: number;
  duThu: number;
  revenueNet: number;
  /** Tổng chiết khấu (cột TongChi) */
  tongCK: number;
  collected: number;
  debt: number;
  date: string;
  createdDate: string;
  experienceDate: string;
  creator: string;
  /** Tên khách hàng (cột TenKhachHang) — dùng cho ranking khách hàng & phân loại "Công ty" */
  customerName: string | null;
  /** Đơn giá (cột DonGia) — dùng cho chart "Đơn giá học sinh theo phân khúc" */
  donGia: number;
};

const toStr = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" || s === "nan" ? null : s;
};
const NO_ASSIGNED_STAFF = new Set(["n/a", "na", "không xác định"]);
const toStaff = (v: unknown): string | null => {
  const s = toStr(v);
  return s && !NO_ASSIGNED_STAFF.has(s.toLowerCase()) ? s : null;
};
const NO_PROMO = new Set(["không có ctkm", "không tùy chỉnh", "0", "n/a"]);
const toPromo = (v: unknown): string | null => {
  const s = toStr(v);
  return s && !NO_PROMO.has(s.toLowerCase()) ? s : null;
};
const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ */
/* Chuẩn hoá dữ liệu nguồn                                             */
/* ------------------------------------------------------------------ */

export function mapB2C(raw: Record<string, unknown>[]): B2CRow[] {
  // Chỉ lấy dòng có cột BZ ("Sản phẩm") khác rỗng — áp cho TOÀN BỘ dữ liệu B2C.
  const lines = raw
    .filter((r) => toStr(r["Sản phẩm"]) !== null)
    .map((r) => {
    const phoneRaw = toStr(r["SĐT khách hàng"]);
    const phone = phoneRaw ? phoneRaw.replace(/\.0$/, "").replace(/\D/g, "") : null;
    const staffPhoneRaw = toStr(r["Điện thoại nhân viên tạo đơn"]);
    const staffPhone = staffPhoneRaw ? staffPhoneRaw.replace(/\.0$/, "").replace(/\D/g, "") : null;
    const productName = toStr(r["Tên sản phẩm"]) ?? "Không xác định";
    return {
      date: (toStr(r["Ngày"]) ?? "").slice(0, 10),
      customerName: toStr(r["Tên khách hàng"]),
      phone,
      orderCode: toStr(r["Mã đơn hàng"]) ?? "—",
      source: toStr(r["Nguồn đơn hàng"]) ?? "Không xác định",
      productName,
      productType: toStr(r["Loại sản phẩm"]) ?? "—",
      productGroup: toStr(r["Sản phẩm"]) ?? "—",
      category: toStr(r["Sản phẩm"]) ?? "Không xác định",
      branch: toStr(r["Tên chi nhánh"]) ?? toStr(r["ChiNhanh"]) ?? "Không xác định",
      branchCode: toStr(r["ChiNhanh"]) ?? "—",
      staffName: toStr(r["Tên nhân viên tạo đơn"]),
      staffPhone,
      assignedStaff: toStaff(r["Tên nhân viên phụ trách"]),
      promoCode: toPromo(r["MaKhuyenMai"]),
      quantity: toNum(r["Số lượng sản phẩm"]),
      discountRaw: toNum(r["Giảm giá"]),
      discount: toNum(r["Số tiền KM"]) || toNum(r["Giảm giá"]),
      revenue: toNum(r["Tổng doanh thu"]),
      unitPrice: toNum(r["Đơn giá"]),
      orderCount: toNum(r["Số lượng đơn hàng"]),
      isStaffPhone: Boolean(phone && staffPhone && phone === staffPhone),
    };
  });
  // Gộp các dòng cùng đơn -> 1 dòng NET (theo unique đơn hàng): tránh dòng điều chỉnh âm rải rác.
  return collapseByOrder(lines);
}

/**
 * Gộp các dòng B2C cùng Mã đơn hàng thành 1 "đơn": cộng doanh thu / giảm giá / số lượng,
 * gán vào danh mục/ngày/chi nhánh/nhân viên của dòng có doanh thu lớn nhất trong đơn.
 * Dòng không có mã đơn ("—") được giữ riêng từng dòng.
 */
function collapseByOrder(lines: B2CRow[]): B2CRow[] {
  const groups = new Map<string, B2CRow[]>();
  lines.forEach((r, i) => {
    const key = r.orderCode && r.orderCode !== "—" ? r.orderCode : `__no_code_${i}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  });
  const out: B2CRow[] = [];
  for (const ls of groups.values()) {
    const main = ls.reduce((a, b) => (b.revenue > a.revenue ? b : a), ls[0]!);
    out.push({
      ...main,
      quantity: ls.reduce((s, x) => s + x.quantity, 0),
      discountRaw: ls.reduce((s, x) => s + x.discountRaw, 0),
      discount: ls.reduce((s, x) => s + x.discount, 0),
      revenue: ls.reduce((s, x) => s + x.revenue, 0),
      orderCount: 1,
    });
  }
  return out;
}

export const b2cSampleRaw = rawB2C as Record<string, unknown>[];

export let b2cRows: B2CRow[] = mapB2C(b2cSampleRaw);

/** Thay dữ liệu B2C (dùng khi nạp từ Google Sheet); rỗng -> quay về data mẫu. */
export function replaceB2CRows(raw: Record<string, unknown>[] | null) {
  b2cRows = mapB2C(raw && raw.length ? raw : b2cSampleRaw);
  return b2cRows;
}

function schoolLevel(schoolName: string): string {
  const n = schoolName.toUpperCase();
  if (n.startsWith("MN") || n.includes("MẦM NON")) return "Mầm non";
  if (n.startsWith("TH ") || n.includes("TIỂU HỌC")) return "Tiểu học";
  if (n.includes("THCS") || n.includes("TRUNG HỌC CƠ SỞ")) return "THCS";
  if (n.includes("THPT")) return "THPT";
  return "Khác";
}

export const B2B_COLUMNS = [
  "BienBanID",
  "TrangThaiBienBan",
  "SchoolIDCon",
  "ChiNhanh",
  "Quan",
  "SchoolID",
  "TenTruong",
  "SoHopDong",
  "TongSoHSThucTe",
  "DoanhThuGross",
  "TongChi",
  "DoanhThuNet",
  "ThucThu",
  "CongNo",
  "NgayTaoBienBan",
  "NguoiTaoBienBan",
  "NgayTraiNghiem",
  "TenKhachHang",
  "SoHSHopDong",
  "DonGia",
] as const;

export function mapB2B(raw: Record<string, unknown>[]): B2BRow[] {
  return raw.map((r) => {
    const status = toStr(r["TrangThaiBienBan"]) ?? "";
    const schoolName = toStr(r["TenTruong"]) ?? "Không xác định";
    return {
      bienBanId: toStr(r["BienBanID"]) ?? "—",
      status,
      statusCode: Number.parseInt(status, 10) || 0,
      schoolIdCon: toStr(r["SchoolIDCon"]) ?? "—",
      branch: toStr(r["ChiNhanh"]) ?? "Không xác định",
      district: toStr(r["Quan"]) ?? "Không xác định",
      schoolKey: toStr(r["SchoolID"]) ?? schoolName,
      schoolName,
      level: schoolLevel(schoolName),
      contract: toStr(r["SoHopDong"]) ?? "—",
      students: toNum(r["TongSoHSThucTe"]),
      soHSHopDong: toNum(r["SoHSHopDong"]),
      revenueGross: toNum(r["DoanhThuGross"]),
      duThu: toNum(r["DuThu"]),
      revenueNet: toNum(r["DoanhThuNet"]),
      tongCK: toNum(r["TongChi"]),
      collected: toNum(r["ThucThu"]),
      debt: toNum(r["CongNo"]),
      date: (toStr(r["NgayTraiNghiem"]) ?? toStr(r["NgayTaoBienBan"]) ?? "").slice(0, 10),
      createdDate: (toStr(r["NgayTaoBienBan"]) ?? "").slice(0, 10),
      experienceDate: (toStr(r["NgayTraiNghiem"]) ?? "").slice(0, 10),
      creator: toStr(r["NguoiTaoBienBan"]) ?? "—",
      customerName: toStr(r["TenKhachHang"]),
      donGia: toNum(r["DonGia"]),
    };
  });
}

/* ------------------------------------------------------------------ */
/* Phân loại khách hàng B2B — DÙNG CHUNG cho các trang B2B/Tổng quan   */
/* ------------------------------------------------------------------ */

/** Thứ tự cố định của phân khúc "Doanh thu theo cấp học" — dùng chung cho chart + heatmap. */
export const SEGMENT_ORDER = ["Mầm non/Mẫu giáo", "Tiểu học", "THCS", "THPT", "Liên cấp", "Công ty", "Khác"] as const;

/** Màu vàng riêng cho phân khúc "Công ty" để phân biệt trên mọi chart/trang. */
export const COMPANY_COLOR = "oklch(0.83 0.16 88)";

/**
 * Phân khúc cho chart "Doanh thu theo cấp học" + heatmap khách hàng + KPI toàn trang.
 * Ưu tiên: Tên khách hàng (cột R) chứa "Công ty" -> "Công ty"; chứa "Cao đẳng"/"Đại học" -> "Khác";
 * chứa "THCS-THPT"/"TH-THCS-THPT" -> "Liên cấp"; còn lại theo cấp học suy từ tên trường (r.level).
 */
export const segmentOf = (r: B2BRow) => {
  const name = (r.customerName ?? "").toLowerCase();
  if (name.includes("công ty")) return "Công ty";
  if (name.includes("cao đẳng") || name.includes("đại học")) return "Khác";
  if (name.includes("th-thcs-thpt") || name.includes("thcs-thpt")) return "Liên cấp";
  if (r.level === "Mầm non") return "Mầm non/Mẫu giáo";
  if (r.level === "Tiểu học" || r.level === "THCS" || r.level === "THPT") return r.level;
  return "Khác";
};

/** Khoá gộp cho ranking/lọc chéo theo khách hàng — ưu tiên Tên khách hàng, fallback tên trường. */
export const customerKeyOf = (r: B2BRow) => r.customerName || r.schoolName;

/** Gộp phân khúc về 2 nhóm lớn "Công ty" / "Trường" — dùng cho KPI "Số khách hàng" ở mọi trang. */
export const entityOf = (r: B2BRow) => (segmentOf(r) === "Công ty" ? "Công ty" : "Trường");

export const b2bSampleRaw = rawB2B as Record<string, unknown>[];

/** Dữ liệu B2B "nền" (Google Sheet sau khi nạp, hoặc data mẫu trước khi nạp). */
let b2bBaseRaw: Record<string, unknown>[] = b2bSampleRaw;

// eslint-disable-next-line prefer-const
export let b2bRows: B2BRow[] = mapB2B(b2bBaseRaw);

/** Đặt dữ liệu B2B nền (dùng khi nạp từ Google Sheet); rỗng -> quay về data mẫu. */
export function setB2BBase(raw: Record<string, unknown>[] | null) {
  b2bBaseRaw = raw && raw.length ? raw : b2bSampleRaw;
  b2bRows = mapB2B(b2bBaseRaw);
  return b2bRows;
}

/** Thay B2B bằng dữ liệu user import (chạy phía client); rỗng -> quay về data nền. */
export function replaceB2BRows(raw: Record<string, unknown>[] | null) {
  b2bRows = mapB2B(raw && raw.length ? raw : b2bBaseRaw);
  return b2bRows;
}


/** Business rule: B2B chỉ tính biên bản có trạng thái 4–9 */
export const isValidB2B = (row: B2BRow) => row.statusCode >= 4 && row.statusCode <= 9;

/* ------------------------------------------------------------------ */
/* Filters                                                             */
/* ------------------------------------------------------------------ */

export type TimeUnit = "day" | "weekday" | "week" | "month" | "quarter" | "year";

export type Filters = {
  from: string;
  to: string;
  model: "all" | "b2c" | "b2b";
  branch: string;
  /** Danh mục sản phẩm — CHỌN NHIỀU: mảng rỗng = "Tất cả danh mục", không rỗng = chỉ lấy các danh mục có trong mảng. */
  category: string[];
  source: string;
  timeUnit: TimeUnit;
};

function computeDataPeriod() {
  const allDates = [...b2cRows.map((r) => r.date), ...b2bRows.map((r) => r.date)]
    .filter(Boolean)
    .sort();
  return { from: allDates[0] ?? "", to: allDates[allDates.length - 1] ?? "" };
}
function makeDefaultFilters(): Filters {
  const p = computeDataPeriod();
  return {
    from: p.from,
    to: p.to,
    model: "all",
    branch: "all",
    category: [],
    source: "all",
    timeUnit: "day",
  };
}
function computeBranchOptions() {
  return Array.from(
    new Set([...b2cRows.map((r) => r.branch), ...b2bRows.map((r) => r.branch)]),
  ).sort();
}
/** Chi nhánh cho bộ lọc B2C = giá trị cột "Tên chi nhánh" (AP) KHÁC RỖNG trong dữ liệu B2C. */
function computeB2CBranchOptions() {
  return Array.from(
    new Set(b2cRows.map((r) => r.branch).filter((b) => b && b !== "Không xác định")),
  ).sort();
}
/** Chi nhánh cho bộ lọc B2B = giá trị cột "ChiNhanh" (D) KHÁC RỖNG trong dữ liệu B2B — không gộp với B2C. */
function computeB2BBranchOptions() {
  return Array.from(
    new Set(b2bRows.map((r) => r.branch).filter((b) => b && b !== "Không xác định")),
  ).sort();
}
function computeSourceOptions() {
  return Array.from(new Set(b2cRows.map((r) => r.source))).sort();
}
/** Danh mục sản phẩm B2C = các giá trị cột BZ ("Sản phẩm") có trong dữ liệu (động). */
function computeCategoryOptions() {
  return Array.from(new Set(b2cRows.map((r) => r.category).filter(Boolean))).sort();
}

// Các giá trị dẫn xuất là "live binding" (export let): sau khi nạp data thật và gọi
// recomputeDerived(), mọi nơi import chúng sẽ thấy giá trị mới ở lần render kế tiếp.
export let dataPeriod = computeDataPeriod();
export let defaultFilters: Filters = makeDefaultFilters();
export let branchOptions = computeBranchOptions();
export let b2cBranchOptions = computeB2CBranchOptions();
export let b2bBranchOptions = computeB2BBranchOptions();
export let sourceOptions = computeSourceOptions();
export let categoryOptions = computeCategoryOptions();

/** Tính lại các giá trị dẫn xuất sau khi thay b2cRows/b2bRows bằng data từ Sheet. */
export function recomputeDerived() {
  dataPeriod = computeDataPeriod();
  defaultFilters = makeDefaultFilters();
  branchOptions = computeBranchOptions();
  b2cBranchOptions = computeB2CBranchOptions();
  b2bBranchOptions = computeB2BBranchOptions();
  sourceOptions = computeSourceOptions();
  categoryOptions = computeCategoryOptions();
}

export function filterB2C(f: Filters): B2CRow[] {
  if (f.model === "b2b") return [];
  return b2cRows.filter(
    (r) =>
      r.date >= f.from &&
      r.date <= f.to &&
      (f.branch === "all" || r.branch === f.branch) &&
      (f.category.length === 0 || f.category.includes(r.category)) &&
      (f.source === "all" || r.source === f.source),
  );
}

export function filterB2B(f: Filters): B2BRow[] {
  if (f.model === "b2c") return [];
  // B2B chỉ "tính là" danh mục "Vé đoàn" — nếu đang lọc theo 1+ danh mục cụ thể mà KHÔNG có
  // "Vé đoàn" trong đó thì B2B không thuộc lựa chọn này.
  if (f.category.length > 0 && !f.category.includes("Vé đoàn")) return [];
  return b2bRows.filter(
    (r) =>
      isValidB2B(r) &&
      r.date >= f.from &&
      r.date <= f.to &&
      (f.branch === "all" || r.branch === f.branch),
  );
}

/* ------------------------------------------------------------------ */
/* Time bucketing                                                      */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

export function bucketOf(dateStr: string, unit: TimeUnit): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  switch (unit) {
    case "day":
      return dateStr;
    case "weekday":
      return WEEKDAYS[d.getDay()] ?? dateStr;
    case "week": {
      const start = new Date(d);
      start.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return `Tuần ${start.toISOString().slice(0, 10)}`;
    }
    case "month":
      return `${y}-${String(m).padStart(2, "0")}`;
    case "quarter":
      return `${y}-Q${Math.ceil(m / 3)}`;
    case "year":
      return String(y);
  }
}

export function bucketLabel(bucket: string, unit: TimeUnit): string {
  if (unit === "day") {
    const [, m, d] = bucket.split("-");
    return `${d}/${m}`;
  }
  if (unit === "week") {
    // bucket = "Tuần YYYY-MM-DD" (thứ Hai đầu tuần) -> nhãn "T{tháng}·Tuần {tuần trong tháng}"
    const iso = bucket.replace("Tuần ", "");
    const [, mm, dd] = iso.split("-").map((x) => Number(x));
    const wom = Math.floor((((dd ?? 1) - 1) / 7)) + 1;
    return `T${mm ?? "?"}·Tuần ${wom}`;
  }
  if (unit === "month") {
    const [y, m] = bucket.split("-");
    return `T${Number(m)}/${(y ?? "").slice(2)}`;
  }
  return bucket;
}

export function sortBuckets(buckets: string[], unit: TimeUnit): string[] {
  if (unit === "weekday") {
    const order = WEEKDAYS.slice(1).concat(WEEKDAYS[0] as string);
    return buckets.slice().sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }
  return buckets.slice().sort();
}

/* ------------------------------------------------------------------ */
/* KPI Target (sheet "KPI") — % doanh thu đạt so với target theo tháng  */
/* ------------------------------------------------------------------ */

export type KpiTargetRow = {
  /** Cột "Nhom" — vd "STEMTOWN" (để dành khi sheet có thêm KDI/KDC sau này). */
  nhom: string;
  /** Cột "PhanLoai" — "B2C" hoặc "B2B". */
  phanLoai: string;
  /** Cột "LoaiSanPham" (mới thêm) — vd "DOANH THU", "HỌC SINH", "Hàng bán"... Rỗng = sheet cũ
   *  chưa có cột này -> coi như "DOANH THU" để không vỡ target cũ. */
  loaiSanPham: string;
  /** Cột "DVT" (mới thêm) — vd "nghìn đồng", "Số HS", "triệu đồng". */
  dvt: string;
  /** Tháng dạng "yyyy-MM" (đã quy đổi từ tên cột "Y26-09" -> "2026-09"). */
  month: string;
  /** Giá trị target theo ĐƠN VỊ GỐC: VNĐ cho dòng doanh thu (sheet ghi theo NGHÌN ĐỒNG -> x1.000),
   *  giữ NGUYÊN số cho dòng "HỌC SINH" (DVT = "Số HS", không phải tiền nên không nhân 1.000). */
  targetValue: number;
};

/** Cột tháng hợp lệ trong sheet KPI dạng "Y{2 số năm}-{2 số tháng 01-12}", vd "Y26-09" -> 2026-09.
 *  Cột tổng cả năm học (vd "Y26-27") không khớp regex này nên tự động bị bỏ qua. */
const KPI_MONTH_COL = /^Y(\d{2})-(0[1-9]|1[0-2])$/i;

/** Chuẩn hoá chuỗi để so khớp "Nhom"/"PhanLoai" không phân biệt hoa/thường, khoảng trắng thừa
 *  (vd sheet ghi "STEM TOWN"/"Stem Town"/"b2c " đều phải khớp "STEMTOWN"/"B2C"). */
const normKey = (s: string) => s.replace(/\s+/g, "").toUpperCase();

/** Chuẩn hoá "LoaiSanPham" để so khớp không phân biệt dấu/hoa-thường/khoảng trắng thừa
 *  (vd "Học Sinh" / "HỌC SINH" / "học   sinh" đều khớp "HOC SINH"). */
function normCategory(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Loại target đang cần: "revenue" (doanh thu, dùng cho card/chart doanh thu) hoặc
 *  "students" (số học sinh tham gia — dòng LoaiSanPham = "HỌC SINH", DVT = "Số HS"). */
export type TargetKind = "revenue" | "students";

/** DVT (đơn vị tính) cho biết dòng này đếm SỐ HỌC SINH (vd "Số HS", "Số học sinh") — không phải tiền.
 *  B2C có 2 dòng học sinh trong sheet KPI ("Khoá học STEM" dòng 8 + "Vé Học sinh" dòng 11) KHÔNG mang
 *  LoaiSanPham="HỌC SINH" mà chỉ nhận diện được qua DVT, nên phải khớp theo DVT thì target số học sinh
 *  B2C mới ra (nếu chỉ khớp theo LoaiSanPham như trước thì luôn "Chưa đủ dữ liệu"). */
function isStudentUnit(dvt: string): boolean {
  const d = normCategory(dvt);
  return d === "SO HS" || d === "SO HOC SINH" || d.includes("HOC SINH");
}

/** Dòng KPI có khớp loại target đang cần không.
 *  - "students": nhận theo DVT ("Số HS"/"Số học sinh") HOẶC LoaiSanPham="HỌC SINH" (giữ tương thích dòng
 *    B2B cũ vốn khớp bằng LoaiSanPham). Nhiều dòng khớp sẽ tự CỘNG DỒN theo tháng ở kpiByMonth.
 *  - "revenue": loại trừ dòng học sinh (tránh đếm nhầm), chỉ nhận dòng DOANH THU (hoặc sheet cũ chưa có
 *    cột LoaiSanPham -> coi như doanh thu để không vỡ target đã dùng trước đây). */
function matchesTargetKind(loaiSanPham: string, dvt: string, kind: TargetKind): boolean {
  const isStudent = isStudentUnit(dvt) || normCategory(loaiSanPham) === "HOC SINH";
  if (kind === "students") return isStudent;
  if (isStudent) return false;
  const c = normCategory(loaiSanPham);
  return c === "DOANH THU" || c === "";
}

export function mapKpi(raw: Record<string, unknown>[]): KpiTargetRow[] {
  const out: KpiTargetRow[] = [];
  for (const r of raw) {
    const nhom = toStr(r["Nhom"]) ?? "";
    const phanLoai = toStr(r["PhanLoai"]) ?? "";
    if (!phanLoai) continue;
    const loaiSanPham = toStr(r["LoaiSanPham"]) ?? "";
    const dvt = toStr(r["DVT"]) ?? "";
    const isStudentRow = isStudentUnit(dvt) || normCategory(loaiSanPham) === "HOC SINH";
    for (const [key, val] of Object.entries(r)) {
      const m = KPI_MONTH_COL.exec(key.trim());
      if (!m) continue;
      const month = `20${m[1]}-${m[2]}`;
      const numVal = toNum(val);
      // Dòng "HỌC SINH": DVT = "Số HS" -> giữ nguyên số, KHÔNG nhân 1.000.
      // Các dòng khác (doanh thu...): sheet ghi theo nghìn đồng -> x1.000 ra VNĐ.
      const targetValue = isStudentRow ? numVal : numVal * 1000;
      out.push({ nhom, phanLoai, loaiSanPham, dvt, month, targetValue });
    }
  }
  return out;
}

const kpiSampleRaw: Record<string, unknown>[] = [];

let kpiBaseRaw: Record<string, unknown>[] = kpiSampleRaw;

// eslint-disable-next-line prefer-const
export let kpiRows: KpiTargetRow[] = mapKpi(kpiBaseRaw);

/** Đặt dữ liệu Target (sheet "KPI") sau khi nạp từ Google Sheet; rỗng -> không có target. */
export function setKpiBase(raw: Record<string, unknown>[] | null) {
  kpiBaseRaw = raw && raw.length ? raw : kpiSampleRaw;
  kpiRows = mapKpi(kpiBaseRaw);
  return kpiRows;
}

/** Danh sách tháng "yyyy-MM" phủ trong khoảng [from, to] (yyyy-MM-dd), theo THÁNG DƯƠNG LỊCH. */
function monthsBetween(from: string, to: string): string[] {
  if (!from || !to) return [];
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out: string[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    out.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`);
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/** Map "yyyy-MM" -> tổng target của tháng đó, lọc theo `phanLoai` + `kind` (revenue/students). */
function kpiByMonth(phanLoai: "B2C" | "B2B", kind: TargetKind): Map<string, number> {
  const byMonth = new Map<string, number>();
  for (const r of kpiRows) {
    if (normKey(r.phanLoai) !== normKey(phanLoai)) continue;
    if (r.nhom && normKey(r.nhom) !== "STEMTOWN") continue;
    if (!matchesTargetKind(r.loaiSanPham, r.dvt, kind)) continue;
    byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.targetValue);
  }
  return byMonth;
}

/**
 * Tổng target của `phanLoai` ("B2C"/"B2B") cho các THÁNG (nguyên tháng, không chia theo ngày)
 * có chạm khoảng lọc [from, to]. `kind` mặc định "revenue" (VNĐ); "students" trả về số học sinh
 * (dòng LoaiSanPham = "HỌC SINH" trong sheet KPI). Trả về null nếu sheet "KPI" chưa có target cho
 * bất kỳ tháng nào trong khoảng đang lọc (vd lọc ra ngoài phạm vi Y26-07..Y27-06 hiện có trong sheet).
 */
export function targetFor(
  phanLoai: "B2C" | "B2B",
  from: string,
  to: string,
  kind: TargetKind = "revenue",
): number | null {
  const months = monthsBetween(from, to);
  if (!months.length) return null;
  const byMonth = kpiByMonth(phanLoai, kind);
  let total = 0;
  let covered = 0;
  for (const m of months) {
    const v = byMonth.get(m);
    if (v !== undefined) {
      total += v;
      covered += 1;
    }
  }
  return covered > 0 ? total : null;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Khoảng ngày [from, to] tương ứng 1 bucket theo `unit` — dùng để chia đều target tháng cho
 *  chart theo thời gian (ngày/tuần/tháng/quý/năm). "weekday" gộp nhiều ngày rời rạc không liên tục
 *  nên không quy ra được khoảng ngày -> trả về null (không so target). */
export function bucketDateRange(bucket: string, unit: TimeUnit): { from: string; to: string } | null {
  switch (unit) {
    case "day":
      return { from: bucket, to: bucket };
    case "week": {
      const iso = bucket.replace("Tuần ", "");
      const d = new Date(`${iso}T00:00:00`);
      if (Number.isNaN(d.getTime())) return null;
      const end = new Date(d);
      end.setDate(d.getDate() + 6);
      return { from: iso, to: toISODate(end) };
    }
    case "month": {
      const [y, m] = bucket.split("-").map(Number);
      if (!y || !m) return null;
      const dim = daysInMonth(y, m);
      return { from: `${bucket}-01`, to: `${bucket}-${String(dim).padStart(2, "0")}` };
    }
    case "quarter": {
      const [ys, qs] = bucket.split("-Q");
      const y = Number(ys);
      const q = Number(qs);
      if (!y || !q) return null;
      const startM = (q - 1) * 3 + 1;
      const endM = startM + 2;
      const dim = daysInMonth(y, endM);
      return {
        from: `${y}-${String(startM).padStart(2, "0")}-01`,
        to: `${y}-${String(endM).padStart(2, "0")}-${String(dim).padStart(2, "0")}`,
      };
    }
    case "year":
      return { from: `${bucket}-01-01`, to: `${bucket}-12-31` };
    case "weekday":
    default:
      return null;
  }
}

/**
 * Target đã CHIA ĐỀU THEO NGÀY từ target tháng (target tháng / số ngày trong tháng), cộng lại đúng
 * số ngày của khoảng [from, to] — cho phép so target ở MỌI mức zoom (kể cả ngày/tuần lẻ), không chỉ
 * nguyên tháng. Trả về null nếu không có target cho bất kỳ ngày nào trong khoảng.
 */
export function proratedTarget(
  phanLoai: "B2C" | "B2B",
  from: string,
  to: string,
  kind: TargetKind = "revenue",
): number | null {
  if (!from || !to || from > to) return null;
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const byMonth = kpiByMonth(phanLoai, kind);
  if (byMonth.size === 0) return null;

  let total = 0;
  let matched = false;
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
    const monthTarget = byMonth.get(monthKey);
    if (monthTarget !== undefined) {
      const dim = daysInMonth(y, m);
      const monthStart = new Date(y, m - 1, 1);
      const monthEnd = new Date(y, m - 1, dim);
      const rangeStart = start > monthStart ? start : monthStart;
      const rangeEnd = end < monthEnd ? end : monthEnd;
      const overlapDays = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000) + 1;
      if (overlapDays > 0) {
        total += (monthTarget / dim) * overlapDays;
        matched = true;
      }
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return matched ? total : null;
}

/** Target (đã chia đều theo ngày) cho đúng 1 bucket của chart theo thời gian — dùng trong tooltip
 *  "so với Target" ở mọi mức zoom Ngày/Tuần/Tháng/Quý/Năm. */
export function targetForBucket(
  phanLoai: "B2C" | "B2B",
  bucket: string,
  unit: TimeUnit,
  kind: TargetKind = "revenue",
): number | null {
  const range = bucketDateRange(bucket, unit);
  if (!range) return null;
  return proratedTarget(phanLoai, range.from, range.to, kind);
}

/**
 * Dựng sẵn subMetric "% đạt Target" dùng chung cho card Doanh thu / Số học sinh ở các tab, kèm dòng
 * "Target: ..." hiện NGAY dưới (không chỉ tooltip). Luôn hiện 🔺 (không phân biệt đạt/chưa đạt theo
 * yêu cầu). `formatTarget` mặc định định dạng tiền rút gọn (640tr/1,2tỷ) — truyền formatter khác khi
 * target không phải tiền (vd số học sinh). `null` (sheet KPI chưa có target cho khoảng đang lọc) →
 * "Chưa đủ dữ liệu".
 */
export function targetSubMetric(
  actual: number,
  target: number | null,
  formatTarget: (n: number) => string = formatTargetShort,
): SubMetric {
  if (target === null || target <= 0) {
    return { label: "% đạt Target", value: "Chưa đủ dữ liệu" };
  }
  const pct = (actual / target) * 100;
  return {
    label: "% đạt Target",
    value: `🔺 ${formatPercent(pct)}`,
    belowText: `Target: ${formatTarget(target)}`,
  };
}

export function groupSum<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const map = new Map<string, number>();
  for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + value(r));
  return map;
}

export function toSortedPairs(map: Map<string, number>, desc = true) {
  return Array.from(map, ([name, value]) => ({ name, value })).sort((a, b) =>
    desc ? b.value - a.value : a.value - b.value,
  );
}
