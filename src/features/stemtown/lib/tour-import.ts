import { TOUR_COLUMNS, tourSampleRaw } from "@/features/stemtown/lib/dashboard-data";

const STORAGE_KEY = "stemtown.b2b.tours.imported";

/* ----------------------------- CSV helpers ----------------------------- */

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const NUMERIC_COLUMNS = new Set(["SL HS", "SL TT", "Số lượng GV", "Giá vé", "Doanh thu dự kiến"]);

/** Parse số kiểu Việt Nam: "." là dấu phân cách nghìn (150.000 = 150000), "," nếu có là thập phân
 *  (vd 1.234,5). Number("5.700.000") của JS hiểu sai thành NaN/150 vì coi "." là dấu thập phân —
 *  đây chính là lý do cột Giá vé/Doanh thu dự kiến trước đó không lên số. */
function parseVNNumber(raw: string): number {
  let s = raw.trim().replace(/[^\d.,-]/g, "");
  if (!s) return 0;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // "," là thập phân -> "." là phân cách nghìn, bỏ hết "."
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    // "." là phân cách nghìn (chuẩn VN, vd 5.700.000) -> bỏ hết "." và ","
    s = s.replace(/[.,]/g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function coerce(header: string, value: string): unknown {
  const v = value.trim();
  if (v === "") return header === "SL TT" ? null : NUMERIC_COLUMNS.has(header) ? 0 : null;
  if (NUMERIC_COLUMNS.has(header)) return parseVNNumber(v);
  return v;
}

/* ------------------------------ Public API ----------------------------- */

export type ImportResult = { rows: Record<string, unknown>[]; missing: string[] };

export async function parseTourFile(file: File): Promise<ImportResult> {
  const text = await file.text();
  let rows: Record<string, unknown>[];

  if (file.name.toLowerCase().endsWith(".json")) {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) throw new Error("File JSON phải là một mảng các dòng dữ liệu.");
    rows = parsed as Record<string, unknown>[];
  } else {
    const table = parseCsv(text);
    const header = (table[0] ?? []).map((h) => h.trim());
    if (header.length < 2) throw new Error("Không đọc được dòng tiêu đề của file.");
    rows = table.slice(1).map((cells) => {
      const obj: Record<string, unknown> = {};
      header.forEach((h, i) => {
        obj[h] = coerce(h, cells[i] ?? "");
      });
      return obj;
    });
  }

  if (!rows.length) throw new Error("File không có dòng dữ liệu nào.");
  const keys = new Set(Object.keys(rows[0] ?? {}));
  const required = ["Tên trường"]; // Ngày tham quan có thể để trống nếu đã điền cột Tháng
  const missingRequired = required.filter((k) => !keys.has(k));
  if (missingRequired.length)
    throw new Error(`Thiếu cột bắt buộc: ${missingRequired.join(", ")}. Hãy tải template để đúng định dạng.`);

  return { rows, missing: TOUR_COLUMNS.filter((c) => !keys.has(c)) };
}

export function saveImportedTours(rows: Record<string, unknown>[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function loadImportedTours(): Record<string, unknown>[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

export function clearImportedTours() {
  localStorage.removeItem(STORAGE_KEY);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Tải template CSV (mở được bằng Excel) kèm dữ liệu mẫu ban đầu. */
/** ISO "yyyy-MM-dd" -> "dd/MM/yyyy" (đúng định dạng Google Sheets VN xuất ra). Excel/Sheets sẽ
 *  không tự "sửa" hiển thị theo locale khác vì dd > 12 ở phần lớn ngày sẽ bị coi là text thuần. */
function isoToDMY(iso: unknown): string {
  const s = typeof iso === "string" ? iso : "";
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

export function downloadTourTemplate() {
  const header = TOUR_COLUMNS.join(",");
  const body = tourSampleRaw
    .map((r) =>
      TOUR_COLUMNS.map((c) => {
        const raw = (r as Record<string, unknown>)[c] ?? "";
        return csvCell(c === "Ngày tham quan" ? isoToDMY(raw) : raw);
      }).join(","),
    )
    .join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-b2b-lich-tour.csv";
  a.click();
  URL.revokeObjectURL(url);
}
