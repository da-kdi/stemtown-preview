import { B2B_COLUMNS, b2bSampleRaw } from "@/features/stemtown/lib/dashboard-data";

const STORAGE_KEY = "stemtown.b2b.imported";

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

const NUMERIC_COLUMNS = new Set([
  "TongSoHSThucTe",
  "SoHSHopDong",
  "DoanhThuGross",
  "TongChi",
  "DuThu",
  "DoanhThuNet",
  "ThucThu",
  "CongNo",
  "DonGia",
]);

function coerce(header: string, value: string): unknown {
  const v = value.trim();
  if (v === "") return NUMERIC_COLUMNS.has(header) ? 0 : null;
  if (NUMERIC_COLUMNS.has(header)) {
    const n = Number(v.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return v;
}

/* ------------------------------ Public API ----------------------------- */

export type ImportResult = { rows: Record<string, unknown>[]; missing: string[] };

export async function parseB2BFile(file: File): Promise<ImportResult> {
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
  const required = ["BienBanID", "TrangThaiBienBan", "TenTruong", "DoanhThuNet", "NgayTaoBienBan"];
  const missingRequired = required.filter((k) => !keys.has(k));
  if (missingRequired.length)
    throw new Error(`Thiếu cột bắt buộc: ${missingRequired.join(", ")}. Hãy tải template để đúng định dạng.`);

  return { rows, missing: B2B_COLUMNS.filter((c) => !keys.has(c)) };
}

export function saveImportedB2B(rows: Record<string, unknown>[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows));
}

export function loadImportedB2B(): Record<string, unknown>[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length ? (parsed as Record<string, unknown>[]) : null;
  } catch {
    return null;
  }
}

export function clearImportedB2B() {
  localStorage.removeItem(STORAGE_KEY);
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Tải template CSV (mở được bằng Excel) kèm dữ liệu mẫu ban đầu. */
export function downloadB2BTemplate() {
  const header = B2B_COLUMNS.join(",");
  const body = b2bSampleRaw
    .map((r) => B2B_COLUMNS.map((c) => csvCell((r as Record<string, unknown>)[c] ?? "")).join(","))
    .join("\n");
  const blob = new Blob([`\uFEFF${header}\n${body}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template-b2b-bien-ban-nghiem-thu.csv";
  a.click();
  URL.revokeObjectURL(url);
}
