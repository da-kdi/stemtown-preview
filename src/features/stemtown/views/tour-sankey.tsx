import { useEffect, useMemo, useRef, useState } from "react";

import { CHART_COLORS, TooltipBox } from "@/features/stemtown/components/chart-kit";
import { Panel } from "@/features/stemtown/components/panel";
import contractLookup from "@/features/stemtown/data/bienban-hopdong.json";
import { COMPANY_COLOR, b2bRows } from "@/features/stemtown/lib/dashboard-data";
import { formatNumber } from "@/features/stemtown/lib/format";
import { isCompanyName } from "@/features/stemtown/lib/khach-hang";
import { reconcileStatus, type RecStatus, type TourItem } from "@/features/stemtown/lib/tour-rules";
import { cn } from "@/lib/utils";

type Metric = "dt" | "n" | "hs";
type CustFilter = "all" | "company" | "school";
type Kind = "c" | "u" | "s";
type Path = { cid: string; cname: string; isCo: boolean; uid: string; uname: string; s: RecStatus; dt: number; hs: number; contracts: string[] };
type Flow = { p: Path; c: string; u: string; s: RecStatus };
type Member = { id: string; name: string; v: number; n: number };
type Node = { id: string; kind: Kind; name: string; flows: Flow[]; v: number; n: number; contracts: number; keys: string[]; x: number; w: number; y: number; h: number; oo: number; io: number; color: string; members?: Member[] };
type Geo = { x0: number; x1: number; y0: number; y1: number; ha: number; hb: number };
type LinkG = { key: string; a: Node; b: Node; v: number; flows: Flow[]; geo: Geo; color: string };
export type NodeSel = { keys: string[]; label: string };
export type SankeySel = { cust?: NodeSel; unit?: NodeSel; rec?: RecStatus };

const UNLINKED = "__unlinked";
const OTH_C = "__othC";
const OTH_U = "__othU";
const TOP_C = 5;
const TOP_U = 7;
const FONT = '"Segoe UI", system-ui, sans-serif';
const FS_NAME = 12;
const FS_SUB = 11;
const Y0 = 44;
const GAP = 6;
const MINH = 34;
const UNLINKED_H = 30;
const layoutCols = (W: number) => {
  const w = Math.max(120, Math.min(210, Math.floor(W * 0.27)));
  const gap = (W - 3 * w) / 2;
  return [0, 1, 2].map((i) => ({ x: Math.round(i * (w + gap)), w }));
};
let ctx2d: CanvasRenderingContext2D | null | undefined;
const textW = (t: string, size: number, weight: number) => {
  if (ctx2d === undefined) ctx2d = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!ctx2d) return t.length * size * 0.56;
  ctx2d.font = `${weight} ${size}px ${FONT}`;
  return ctx2d.measureText(t).width;
};
const fit = (t: string, max: number, size: number, weight: number) => {
  if (textW(t, size, weight) <= max) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textW(`${t.slice(0, mid).trimEnd()}…`, size, weight) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo <= 0 ? "" : `${t.slice(0, lo).trimEnd()}…`;
};

const STATUS_ORDER: RecStatus[] = ["Đã nghiệm thu", "Chưa nghiệm thu", "Chưa đi"];
const STATUS_COLOR: Record<RecStatus, string> = { "Đã nghiệm thu": "#2e9e5b", "Chưa nghiệm thu": CHART_COLORS.accent, "Chưa đi": CHART_COLORS.axis };
const STATUS_SHORT: Record<RecStatus, string> = { "Đã nghiệm thu": "Đã NT", "Chưa nghiệm thu": "Chưa NT", "Chưa đi": "Chưa đi" };
const METRIC_LABEL: Record<Metric, string> = { dt: "Doanh thu", n: "Số tour", hs: "Số học sinh" };
const LOOKUP = contractLookup as Record<string, { contract: string; customer: string }>;

const val = (p: Path, m: Metric) => (m === "dt" ? p.dt : m === "hs" ? p.hs : 1);
const fmt = (v: number, m: Metric) =>
  m === "dt" ? `${formatNumber(v / 1_000_000, v < 100_000_000 ? 1 : 0)} tr` : m === "hs" ? `${formatNumber(v)} HS` : `${formatNumber(v)} tour`;
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[.\s]+$/, "").trim();
const keyOf = (s: string) => clean(s).toUpperCase();
const statusCounts = (fl: Flow[]) => {
  const o: Record<RecStatus, number> = { "Đã nghiệm thu": 0, "Chưa nghiệm thu": 0, "Chưa đi": 0 };
  fl.forEach((f) => {
    o[f.s] += 1;
  });
  return o;
};

export const custKeyOf = (r: TourItem): string => {
  const c = (r.tenKhachHang ?? "").split(";")[0]?.trim() ?? "";
  return c ? keyOf(c) : UNLINKED;
};
export const unitKeyOf = (r: TourItem): string => keyOf(r.schoolName);

const rpath = (g: Geo, f = 1) => {
  const ha = g.ha * f;
  const hb = g.hb * f;
  const xm = (g.x0 + g.x1) / 2;
  return `M${g.x0} ${g.y0} C${xm} ${g.y0} ${xm} ${g.y1} ${g.x1} ${g.y1} L${g.x1} ${g.y1 + hb} C${xm} ${g.y1 + hb} ${xm} ${g.y0 + ha} ${g.x0} ${g.y0 + ha} Z`;
};

function ribbon(a: Node, b: Node, v: number): Geo {
  const ha = (a.h * v) / a.v;
  const hb = (b.h * v) / b.v;
  const y0 = a.y + a.oo;
  const y1 = b.y + b.io;
  a.oo += ha;
  b.io += hb;
  return { x0: a.x + a.w, x1: b.x, y0, y1, ha, hb };
}

export function TourSankey({
  rows,
  sel,
  onToggle,
  onClear,
}: {
  rows: TourItem[];
  sel: SankeySel;
  onToggle: (kind: Kind, v: NodeSel | RecStatus) => void;
  onClear: () => void;
}) {
  const [metric, setMetric] = useState<Metric>("dt");
  const [custFilter, setCustFilter] = useState<CustFilter>("all");
  const [withUnlinked, setWithUnlinked] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; node?: Node; link?: LinkG } | null>(null);
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    // Panel gỡ children khi không có dữ liệu -> phần tử đo bị tạo lại; phải gắn lại observer theo element.
    const el = wrapEl;
    if (!el) return;
    const upd = () => setW(Math.max(360, Math.floor(el.clientWidth)));
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wrapEl]);
  const COLS = useMemo(() => layoutCols(W), [W]);

  const contractOf = useMemo(() => {
    const live = new Map<string, string>();
    b2bRows.forEach((r) => live.set(r.bienBanId, r.contract));
    return (id: string) => live.get(id) || LOOKUP[id]?.contract || id;
  }, [rows]);

  const allPaths = useMemo<Path[]>(
    () =>
      rows.map((r) => {
        const cust = (r.tenKhachHang ?? "").split(";")[0]?.trim() ?? "";
        const linked = cust !== "";
        const ids = (r.bienBanId ?? "").split(";").map((x) => x.trim()).filter(Boolean);
        const cons = (r.soHopDong ?? "").split(";").map((x) => x.trim()).filter(Boolean);
        return {
          cid: custKeyOf(r),
          cname: linked ? clean(cust) : "Chưa gắn biên bản",
          isCo: linked && isCompanyName(cust),
          uid: unitKeyOf(r),
          uname: clean(r.schoolName),
          s: reconcileStatus(r),
          dt: r.revenue,
          hs: r.students,
          contracts: ids.map((id, i) => cons[i] ?? contractOf(id)),
        };
      }),
    [rows, contractOf],
  );

  const linkedCount = useMemo(() => allPaths.filter((p) => p.cid !== UNLINKED).length, [allPaths]);

  const paths = useMemo(
    () =>
      allPaths.filter((p) => {
        if (p.cid === UNLINKED) return custFilter === "all" && withUnlinked;
        if (custFilter === "company") return p.isCo;
        if (custFilter === "school") return !p.isCo;
        return true;
      }),
    [allPaths, custFilter, withUnlinked],
  );

  const model = useMemo(() => {
    if (!paths.length) return null;
    const sum = (ps: Path[]) => ps.reduce((a, p) => a + val(p, metric), 0);
    const group = (key: (p: Path) => string) => {
      const m = new Map<string, Path[]>();
      paths.forEach((p) => {
        const k = key(p);
        const arr = m.get(k);
        if (arr) arr.push(p);
        else m.set(k, [p]);
      });
      return m;
    };
    const byC = group((p) => p.cid);
    const byU = group((p) => p.uid);
    const rank = (m: Map<string, Path[]>, skip?: string) =>
      [...m.entries()]
        .filter(([id]) => id !== skip)
        .map(([id, ps]) => ({ id, ps, v: sum(ps) }))
        .sort((a, b) => b.v - a.v || b.ps.length - a.ps.length);
    const cRank = rank(byC, UNLINKED);
    const uRank = rank(byU);
    const cKeep = new Set((showAll ? cRank : cRank.slice(0, TOP_C)).map((x) => x.id));
    const uKeep = new Set((showAll ? uRank : uRank.slice(0, TOP_U)).map((x) => x.id));
    const flows: Flow[] = paths.map((p) => ({
      p,
      c: p.cid === UNLINKED ? UNLINKED : cKeep.has(p.cid) ? p.cid : OTH_C,
      u: uKeep.has(p.uid) ? p.uid : OTH_U,
      s: p.s,
    }));
    const gf = (key: (f: Flow) => string) => {
      const m = new Map<string, Flow[]>();
      flows.forEach((f) => {
        const k = key(f);
        const arr = m.get(k);
        if (arr) arr.push(f);
        else m.set(k, [f]);
      });
      return m;
    };
    const fC = gf((f) => f.c);
    const fU = gf((f) => f.u);
    const fS = gf((f) => f.s);
    const mk = (id: string, kind: Kind, name: string, fl: Flow[], col: number, color: string, members?: Member[]): Node => {
      const set = new Set<string>();
      fl.forEach((f) => f.p.contracts.forEach((c) => set.add(c)));
      return { id, kind, name, flows: fl, v: sum(fl.map((f) => f.p)), n: fl.length, contracts: set.size, x: COLS[col]!.x, w: COLS[col]!.w, y: 0, h: 0, oo: 0, io: 0, color, members, keys: members ? members.map((m) => m.id) : [id] };
    };

    const cs: Node[] = cRank
      .filter((x) => cKeep.has(x.id))
      .map((x) => mk(x.id, "c", x.ps[0]!.cname, fC.get(x.id)!, 0, x.ps[0]!.isCo ? COMPANY_COLOR : CHART_COLORS.primary));
    const restC = cRank.filter((x) => !cKeep.has(x.id));
    if (restC.length) cs.push(mk(OTH_C, "c", `${restC.length} khách hàng khác`, fC.get(OTH_C)!, 0, CHART_COLORS.axis, restC.map((r) => ({ id: r.id, name: r.ps[0]!.cname, v: r.v, n: r.ps.length }))));
    if (fC.has(UNLINKED)) cs.push(mk(UNLINKED, "c", "Chưa gắn biên bản", fC.get(UNLINKED)!, 0, CHART_COLORS.axis));

    const us: Node[] = uRank.filter((x) => uKeep.has(x.id)).map((x) => mk(x.id, "u", x.ps[0]!.uname, fU.get(x.id)!, 1, CHART_COLORS.dark));
    const restU = uRank.filter((x) => !uKeep.has(x.id));
    if (restU.length) us.push(mk(OTH_U, "u", `${restU.length} đơn vị khác`, fU.get(OTH_U)!, 1, CHART_COLORS.axis, restU.map((r) => ({ id: r.id, name: r.ps[0]!.uname, v: r.v, n: r.ps.length }))));

    const ss: Node[] = STATUS_ORDER.filter((s) => fS.has(s)).map((s) => mk(s, "s", s, fS.get(s)!, 2, STATUS_COLOR[s]));

    const need = (n: number) => n * MINH + Math.max(0, n - 1) * GAP;
    const AH = Math.max(260, need(cs.length), need(us.length), need(ss.length));
    const place = (list: Node[]) => {
      const fixed = list.filter((n) => n.id === UNLINKED);
      const flex = list.filter((n) => n.id !== UNLINKED);
      const tot = flex.reduce((a, n) => a + n.v, 0);
      const k = tot > 0 ? (AH - GAP * (list.length - 1) - fixed.length * UNLINKED_H) / tot : 0;
      let y = Y0;
      list.forEach((n) => {
        n.h = n.id === UNLINKED ? UNLINKED_H : Math.max(MINH, n.v * k);
        n.y = y;
        y += n.h + GAP;
      });
      return y - GAP;
    };
    const endY = Math.max(place(cs), place(us), place(ss));

    const uIdx = new Map(us.map((n, i) => [n.id, i]));
    const sIdx = new Map(ss.map((n, i) => [n.id, i]));
    const uById = new Map(us.map((n) => [n.id, n]));
    const sById = new Map(ss.map((n) => [n.id, n]));
    const links: LinkG[] = [];
    cs.forEach((c) => {
      const m = new Map<string, Flow[]>();
      c.flows.forEach((f) => {
        const arr = m.get(f.u);
        if (arr) arr.push(f);
        else m.set(f.u, [f]);
      });
      [...m.entries()]
        .sort((a, b) => (uIdx.get(a[0]) ?? 0) - (uIdx.get(b[0]) ?? 0))
        .forEach(([uid, fl]) => {
          const b = uById.get(uid)!;
          const v = sum(fl.map((f) => f.p));
          if (v <= 0 || c.v <= 0 || b.v <= 0) return;
          links.push({ key: `${c.id}|${uid}`, a: c, b, v, flows: fl, geo: ribbon(c, b, v), color: c.color });
        });
    });
    us.forEach((u) => {
      const m = new Map<string, Flow[]>();
      u.flows.forEach((f) => {
        const arr = m.get(f.s);
        if (arr) arr.push(f);
        else m.set(f.s, [f]);
      });
      [...m.entries()]
        .sort((a, b) => (sIdx.get(a[0] as RecStatus) ?? 0) - (sIdx.get(b[0] as RecStatus) ?? 0))
        .forEach(([s, fl]) => {
          const b = sById.get(s)!;
          const v = sum(fl.map((f) => f.p));
          if (v <= 0 || u.v <= 0 || b.v <= 0) return;
          links.push({ key: `${u.id}|${s}`, a: u, b, v, flows: fl, geo: ribbon(u, b, v), color: STATUS_COLOR[s as RecStatus] });
        });
    });

    const linked = new Map<string, boolean>();
    paths.forEach((p) => {
      if (p.cid !== UNLINKED) linked.set(p.cid, p.isCo);
    });
    const nCo = [...linked.values()].filter(Boolean).length;
    return {
      cs,
      us,
      ss,
      links,
      flows,
      H: endY + 10,
      total: sum(paths),
      nCo,
      nSch: linked.size - nCo,
      nU: byU.size,
      nUnlinkedTours: (fC.get(UNLINKED) ?? []).length,
      st: statusCounts(flows),
      restC: restC.length,
      restU: restU.length,
    };
  }, [paths, metric, showAll, COLS]);

  const hl = useMemo(() => {
    if (!model || (!sel.cust && !sel.unit && !sel.rec)) return null;
    const cs = sel.cust ? new Set(sel.cust.keys) : null;
    const us = sel.unit ? new Set(sel.unit.keys) : null;
    return new Set(model.flows.filter((f) => (!cs || cs.has(f.p.cid)) && (!us || us.has(f.p.uid)) && (!sel.rec || f.s === sel.rec)));
  }, [sel, model]);
  const selFl = (fl: Flow[]) => (hl ? fl.filter((f) => hl.has(f)) : fl);
  const stat = (n: Node) => {
    const fl = selFl(n.flows);
    const set = new Set<string>();
    fl.forEach((f) => f.p.contracts.forEach((c) => set.add(c)));
    return { fl, v: fl.reduce((a, f) => a + val(f.p, metric), 0), n: fl.length, contracts: set.size };
  };
  const head = useMemo(() => {
    if (!model) return null;
    const fl = hl ? model.flows.filter((f) => hl.has(f)) : model.flows;
    const cu = new Map<string, boolean>();
    const uu = new Set<string>();
    fl.forEach((f) => {
      if (f.p.cid !== UNLINKED) cu.set(f.p.cid, f.p.isCo);
      uu.add(f.p.uid);
    });
    const nCo = [...cu.values()].filter(Boolean).length;
    return { nCo, nSch: cu.size - nCo, nU: uu.size, st: statusCounts(fl), total: fl.reduce((a, f) => a + val(f.p, metric), 0) };
  }, [model, hl, metric]);

  const move = (e: React.MouseEvent, t: { node?: Node; link?: LinkG }) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: Math.max(4, Math.min(e.clientX - r.left + 14, r.width - 250)), y: e.clientY - r.top + 14, ...t });
  };

  const sub = (n: Node) => {
    const t = stat(n);
    if (hl && t.n === 0) return "—";
    return n.kind === "c" && n.id !== UNLINKED
      ? `${fmt(t.v, metric)} · ${formatNumber(t.contracts)} HĐ / ${formatNumber(t.n)} tour`
      : n.kind === "u"
        ? `${fmt(t.v, metric)} · ${formatNumber(t.n)} lần tour`
        : `${fmt(t.v, metric)} · ${formatNumber(t.n)} tour`;
  };
  const picked = (n: Node) => (n.kind === "c" ? sel.cust?.keys.join("|") === n.keys.join("|") : n.kind === "u" ? sel.unit?.keys.join("|") === n.keys.join("|") : sel.rec === n.id);
  const clickNode = (n: Node) => (n.kind === "s" ? onToggle("s", n.id as RecStatus) : onToggle(n.kind, { keys: n.keys, label: n.name }));
  const anySel = !!(sel.cust || sel.unit || sel.rec);

  const seg = (on: boolean) => cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", on ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60");

  const nodeFill = (n: Node) => (n.kind === "u" ? "var(--secondary)" : `color-mix(in oklab, ${n.color} ${n.kind === "c" && n.color === CHART_COLORS.axis ? 14 : 20}%, transparent)`);

  const summary = useMemo(() => {
    if (!anySel || !hl || !model) return null;
    const all = [...model.cs, ...model.us, ...model.ss];
    const byId = new Map(all.map((n) => [`${n.kind}:${n.id}`, n]));
    const groupKind: Kind = sel.unit ? "c" : "u";
    const m = new Map<string, number>();
    hl.forEach((f) => {
      const id = groupKind === "c" ? f.c : f.u;
      m.set(id, (m.get(id) ?? 0) + 1);
    });
    const items = [...m.entries()]
      .map(([id, n]) => ({ name: byId.get(`${groupKind}:${id}`)?.name ?? id, n }))
      .sort((a, b) => b.n - a.n);
    const lead = sel.unit ? "Khách hàng nghiệm thu của" : sel.cust ? "Đơn vị sử dụng của" : "Đơn vị có tour";
    return { lead, name: sel.unit?.label ?? sel.cust?.label ?? sel.rec ?? "", items, total: hl.size };
  }, [sel, hl, model, anySel]);

  return (
    <Panel
      title="Luồng nghiệm thu: Khách hàng → Đơn vị sử dụng → Trạng thái"
      subtitle={`Bấm khách hàng hoặc trường để lần theo quan hệ · ${formatNumber(linkedCount)}/${formatNumber(allPaths.length)} tour đã gắn biên bản`}
      code="CH-TOUR-O7"
      isEmpty={!model}
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {(["dt", "n", "hs"] as const).map((k) => (
            <button key={k} type="button" onClick={() => setMetric(k)} className={seg(metric === k)}>
              {METRIC_LABEL[k]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Loại khách hàng:</span>
          <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
            {(
              [
                ["all", "Tất cả"],
                ["company", "Công ty"],
                ["school", "Trường trực tiếp"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setCustFilter(k);
                  onClear();
                }}
                className={seg(custFilter === k)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <label className={cn("inline-flex items-center gap-1.5 text-xs", custFilter === "all" ? "text-muted-foreground" : "text-muted-foreground/50")}>
          <input type="checkbox" checked={withUnlinked && custFilter === "all"} disabled={custFilter !== "all"} onChange={(e) => setWithUnlinked(e.target.checked)} />
          Gồm tour chưa gắn biên bản
        </label>
        {model && (model.restC > 0 || model.restU > 0 || showAll) && (
          <button type="button" onClick={() => setShowAll((v) => !v)} className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs hover:bg-secondary">
            {showAll ? "Thu gọn (Top N)" : `Xem thêm (+${model.restC} khách hàng, +${model.restU} đơn vị)`}
          </button>
        )}
      </div>

      <div ref={setWrapEl} className="w-full" />
      {model && (
        <div ref={box} className={cn("relative", showAll && "max-h-[640px] overflow-y-auto")} onMouseLeave={() => setTip(null)}>
          <svg width={W} height={model.H} viewBox={`0 0 ${W} ${model.H}`} className="block" role="img" aria-label="Sankey khách hàng nghiệm thu, đơn vị sử dụng, trạng thái nghiệm thu">
            {[
              { x: COLS[0]!.x, a: "start" as const, t: "Khách hàng nghiệm thu", c: `${formatNumber(head!.nCo)} công ty${head!.nSch ? ` + ${formatNumber(head!.nSch)} trường` : ""}` },
              { x: COLS[1]!.x, a: "start" as const, t: "Đơn vị sử dụng", c: `${formatNumber(head!.nU)} đơn vị` },
              { x: W, a: "end" as const, t: "Trạng thái nghiệm thu", c: STATUS_ORDER.map((s) => `${formatNumber(head!.st[s])} ${STATUS_SHORT[s]}`).join(" / ") },
            ].map((h) => (
              <g key={h.t}>
                <text x={h.x} y={12} fontSize={11} fontFamily={FONT} textAnchor={h.a} style={{ fill: "var(--muted-foreground)" }}>
                  {h.t}
                </text>
                <text x={h.x} y={28} fontSize={12} fontFamily={FONT} fontWeight={600} textAnchor={h.a} style={{ fill: "var(--foreground)" }}>
                  {h.c}
                </text>
              </g>
            ))}
            {model.links.map((l) => {
              const vSel = hl ? l.flows.filter((f) => hl.has(f)).reduce((a, f) => a + val(f.p, metric), 0) : l.v;
              const frac = l.v > 0 ? Math.min(1, vSel / l.v) : 0;
              return (
                <g key={l.key}>
                  <path
                    d={rpath(l.geo)}
                    fill={l.color}
                    opacity={hl ? 0.05 : 0.3}
                    onMouseMove={(e) => move(e, { link: l })}
                    onMouseLeave={() => setTip(null)}
                  />
                  {hl && frac > 0 && (
                    <path
                      d={rpath(l.geo, frac)}
                      fill={l.color}
                      opacity={0.6}
                      onMouseMove={(e) => move(e, { link: l })}
                      onMouseLeave={() => setTip(null)}
                    />
                  )}
                </g>
              );
            })}
            {[...model.cs, ...model.us, ...model.ss].map((n) => {
              const on = !hl || n.flows.some((f) => hl.has(f));
              const isPicked = picked(n);
              const room = n.w - 16;
              const two = n.h >= 32;
              return (
                <g
                  key={`${n.kind}:${n.id}`}
                  style={{ cursor: "pointer" }}
                  opacity={on ? 1 : 0.28}
                  onClick={() => clickNode(n)}
                  onMouseMove={(e) => move(e, { node: n })}
                  onMouseLeave={() => setTip(null)}
                >
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={3} fill={nodeFill(n)} stroke={isPicked ? "var(--foreground)" : n.kind === "u" ? "var(--border)" : n.color} strokeWidth={isPicked ? 2 : 0.8} />
                  <text x={n.x + 8} y={two ? n.y + n.h / 2 - 3 : n.y + n.h / 2 + 4} fontSize={FS_NAME} fontFamily={FONT} fontWeight={600} style={{ fill: "var(--foreground)" }}>
                    {fit(n.name, room, FS_NAME, 600)}
                  </text>
                  {two && (
                    <text x={n.x + 8} y={n.y + n.h / 2 + 11} fontSize={FS_SUB} fontFamily={FONT} style={{ fill: "var(--muted-foreground)" }}>
                      {fit(sub(n), room, FS_SUB, 400)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {tip && (tip.node || tip.link) && head && (
            <div className="pointer-events-none absolute z-20 w-60" style={{ left: tip.x, top: tip.y }}>
              {tip.node ? (
                <TooltipBox label={tip.node.name}>
                  {(() => {
                    const t = stat(tip.node);
                    const sc = statusCounts(t.fl);
                    return (
                      <>
                        <p>
                          {METRIC_LABEL[metric]}: <b>{fmt(t.v, metric)}</b>
                          {head.total ? ` (${formatNumber(Math.round((t.v / head.total) * 100))}% tổng)` : ""}
                        </p>
                        <p>Số hợp đồng: {tip.node.kind === "s" || tip.node.id === UNLINKED ? "—" : formatNumber(t.contracts)}</p>
                        <p>Số tour: {formatNumber(t.n)}</p>
                        <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">
                          {STATUS_ORDER.map((s) => `${STATUS_SHORT[s]} ${formatNumber(sc[s])}`).join(" · ")}
                        </p>
                      </>
                    );
                  })()}
                  {tip.node.members && (
                    <div className="mt-1 border-t border-dashed border-border pt-1">
                      {tip.node.members.slice(0, 8).map((m) => (
                        <p key={m.id} className="flex justify-between gap-2">
                          <span className="truncate">{m.name}</span>
                          <span className="tabular-nums">
                            {fmt(m.v, metric)} · {m.n} tour
                          </span>
                        </p>
                      ))}
                      {tip.node.members.length > 8 && <p className="text-muted-foreground">+{tip.node.members.length - 8} nữa</p>}
                    </div>
                  )}
                </TooltipBox>
              ) : tip.link ? (
                <TooltipBox label={`${tip.link.a.name} → ${tip.link.b.name}`}>
                  {(() => {
                    const fl = selFl(tip.link.flows);
                    const sc = statusCounts(fl);
                    return (
                      <>
                        <p>
                          {METRIC_LABEL[metric]}: <b>{fmt(fl.reduce((a, f) => a + val(f.p, metric), 0), metric)}</b>
                        </p>
                        <p>Số tour: {formatNumber(fl.length)}</p>
                        <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">
                          {STATUS_ORDER.map((s) => `${STATUS_SHORT[s]} ${formatNumber(sc[s])}`).join(" · ")}
                        </p>
                      </>
                    );
                  })()}
                </TooltipBox>
              ) : null}
            </div>
          )}
        </div>
      )}

      {summary && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3 text-xs">
          <span className="text-muted-foreground">
            {summary.lead} <b className="text-foreground">{summary.name}</b> ({formatNumber(summary.total)} tour):
          </span>
          {summary.items.slice(0, 8).map((it) => (
            <span key={it.name} className="rounded-full border border-border bg-secondary px-2 py-0.5">
              {it.name} · {formatNumber(it.n)} tour
            </span>
          ))}
          {summary.items.length > 8 && <span className="text-muted-foreground">+{summary.items.length - 8} nữa</span>}
          <button type="button" onClick={onClear} className="ml-1 text-muted-foreground underline">
            Bỏ chọn
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <i className="size-2.5" style={{ background: COMPANY_COLOR }} /> Công ty
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2.5" style={{ background: CHART_COLORS.primary }} /> Trường trực tiếp
        </span>
        <span className="inline-flex items-center gap-1">
          <i className="size-2.5" style={{ background: CHART_COLORS.axis }} /> Chưa gắn / nhóm khác
        </span>
        <span>Độ dày dải theo {METRIC_LABEL[metric].toLowerCase()}. Loại khách hàng: tên chứa công ty / cty / TNHH / cổ phần / tập đoàn / JSC là Công ty (có thể ghi đè trong khachhang-loai.json), còn lại là Trường trực tiếp.</span>
      </div>
    </Panel>
  );
}
