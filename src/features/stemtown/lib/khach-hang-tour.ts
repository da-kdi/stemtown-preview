import contractLookup from "@/features/stemtown/data/bienban-hopdong.json";
import { b2bRows } from "@/features/stemtown/lib/dashboard-data";

/**
 * Khách hàng của một dòng lịch tour = SchoolIDCon, lấy qua khóa nối với Nghiệm thu / Hợp đồng:
 *   1) BienBanID  -> SchoolIDCon (bảng Nghiệm thu; ngoài ra SchoolIDCon chính là phần trước dấu "." của BienBanID)
 *   2) SoHopDong  -> SchoolIDCon (bảng Nghiệm thu/Hợp đồng), dùng khi dòng chưa có BienBanID
 * Tên khách hàng lấy theo SchoolIDCon (không lấy từ tên trường trong lịch tour). Không nối được -> UNLINKED_CUSTOMER.
 */
export const UNLINKED_CUSTOMER = "__unlinked";
export const UNLINKED_CUSTOMER_NAME = "Chưa xác định khách hàng";

type Src = { bienBanId: string | null; soHopDong: string | null; tenKhachHang: string | null };
export type Customer = { id: string; name: string };

const LOOKUP = contractLookup as Record<string, { contract: string; customer: string }>;

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
const norm = (s: string) => clean(s).toUpperCase();
const LEVEL_PREFIX = /^(?:TH-THCS-THPT|THCS-THPT|TH-THCS|MN|TH|THCS|THPT|Tiểu học|Mầm non)\s+(?=.*(?:công ty|cty|tnhh|cổ phần|tập đoàn|jsc))/i;
const tidy = (s: string) => clean(s).replace(LEVEL_PREFIX, "");
const schoolOfBienBan = (id: string) => id.split(".")[0] ?? id;
const split = (s: string | null) => (s ?? "").split(";").map((x) => x.trim()).filter(Boolean);

type Index = { sch: Map<string, string>; byContract: Map<string, string>; name: Map<string, string> };
let cache: { rows: unknown; idx: Index } | null = null;

function index(): Index {
  if (cache && cache.rows === b2bRows) return cache.idx;
  const sch = new Map<string, string>(); // BienBanID -> SchoolIDCon
  const cnt = new Map<string, Map<string, number>>(); // SoHopDong -> {SchoolIDCon: n}
  const names = new Map<string, Map<string, number>>(); // SchoolIDCon -> {tên: n}
  const addName = (id: string, nm: string | null | undefined, w: number) => {
    if (!nm || !clean(nm)) return;
    const m = names.get(id) ?? new Map<string, number>();
    const t = tidy(nm);
    m.set(t, (m.get(t) ?? 0) + w);
    names.set(id, m);
  };
  const addContract = (c: string | null | undefined, id: string) => {
    if (!c || c === "—") return;
    const k = norm(c);
    const m = cnt.get(k) ?? new Map<string, number>();
    m.set(id, (m.get(id) ?? 0) + 1);
    cnt.set(k, m);
  };
  b2bRows.forEach((r) => {
    const id = r.schoolIdCon && r.schoolIdCon !== "—" ? r.schoolIdCon : schoolOfBienBan(r.bienBanId);
    sch.set(r.bienBanId, id);
    addContract(r.contract, id);
    addName(id, r.customerName, 3); // TenKhachHang sạch nhất
    addName(id, r.schoolName, 1);
  });
  Object.entries(LOOKUP).forEach(([bb, v]) => {
    const id = schoolOfBienBan(bb);
    if (!sch.has(bb)) sch.set(bb, id);
    addContract(v.contract, id);
    addName(id, v.customer, 2);
  });
  const byContract = new Map<string, string>();
  cnt.forEach((m, k) => byContract.set(k, [...m.entries()].sort((a, b) => b[1] - a[1])[0]![0]));
  const name = new Map<string, string>();
  names.forEach((m, id) =>
    name.set(id, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0]![0]),
  );
  cache = { rows: b2bRows, idx: { sch, byContract, name } };
  return cache.idx;
}

const memo = new WeakMap<object, Customer>();

export function customerOf(r: Src): Customer {
  const ix = index();
  const hit = memo.get(r);
  if (hit && cache?.idx === ix) return hit;
  let id: string | undefined;
  for (const bb of split(r.bienBanId)) {
    id = ix.sch.get(bb) ?? schoolOfBienBan(bb);
    if (id) break;
  }
  if (!id) for (const c of split(r.soHopDong)) {
    id = ix.byContract.get(norm(c));
    if (id) break;
  }
  const out: Customer = id
    ? { id: id.toUpperCase(), name: ix.name.get(id) ?? tidy(split(r.tenKhachHang)[0] ?? id) }
    : { id: UNLINKED_CUSTOMER, name: UNLINKED_CUSTOMER_NAME };
  memo.set(r, out);
  return out;
}
