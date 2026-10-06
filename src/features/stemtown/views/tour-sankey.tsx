import { useEffect, useMemo, useRef, useState } from "react";

import { CHART_COLORS, TooltipBox } from "@/features/stemtown/components/chart-kit";
import { Panel } from "@/features/stemtown/components/panel";
import contractLookup from "@/features/stemtown/data/bienban-hopdong.json";
import { COMPANY_COLOR, b2bRows } from "@/features/stemtown/lib/dashboard-data";
import { formatNumber } from "@/features/stemtown/lib/format";
import { reconcileStatus, type RecStatus, type TourItem } from "@/features/stemtown/lib/tour-rules";
import { cn } from "@/lib/utils";

type Metric = "dt" | "n" | "hs";
type CustFilter = "all" | "company" | "school";
type Kind = "c" | "u" | "s";
type Path = { cid: string; cname: string; isCo: boolean; uid: string; uname: string; s: RecStatus; dt: number; hs: number; contracts: string[] };
type Flow = { p: Path; c: string; u: string; s: RecStatus };
type Member = { name: string; v: number; n: number };
type Node = { id: string; kind: Kind; name: string; flows: Flow[]; v: number; n: number; contracts: number; x: number; w: number; y: number; h: number; oo: number; io: number; color: string; members?: Member[] };
type LinkG = { key: string; a: Node; b: Node; v: number; flows: Flow[]; d: string; color: string };
type Sel = { kind: Kind; id: string } | null;

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

function ribbon(a: Node, b: Node, v: number): string {
  const ha = (a.h * v) / a.v;
  const hb = (b.h * v) / b.v;
  const y0 = a.y + a.oo;
  const y1 = b.y + b.io;
  a.oo += ha;
  b.io += hb;
  const x0 = a.x + a.w;
  const x1 = b.x;
  const xm = (x0 + x1) / 2;
  return `M${x0} ${y0} C${xm} ${y0} ${xm} ${y1} ${x1} ${y1} L${x1} ${y1 + hb} C${xm} ${y1 + hb} ${xm} ${y0 + ha} ${x0} ${y0 + ha} Z`;
}

export function TourSankey({ rows }: { rows: TourItem[] }) {
  const [metric, setMetric] = useState<Metric>("dt");
  const [custFilter, setCustFilter] = useState<CustFilter>("all");
  const [withUnlinked, setWithUnlinked] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [sel, setSel] = useState<Sel>(null);
  const [tip, setTip] = useState<{ x: number; y: number; node?: Node; link?: LinkG } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const upd = () => setW(Math.max(360, Math.floor(el.clientWidth)));
    upd();
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
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
        return {
          cid: linked ? keyOf(cust) : UNLINKED,
          cname: linked ? clean(cust) : "Chưa gắn biên bản",
          isCo: linked && cust.toLowerCase().includes("công ty"),
          uid: keyOf(r.schoolName),
          uname: clean(r.schoolName),
          s: reconcileStatus(r),
          dt: r.revenue,
          hs: r.students,
          contracts: ids.map(contractOf),
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
      return { id, kind, name, flows: fl, v: sum(fl.map((f) => f.p)), n: fl.length, contracts: set.size, x: COLS[col]!.x, w: COLS[col]!.w, y: 0, h: 0, oo: 0, io: 0, color, members };
    };

    const cs: Node[] = cRank
      .filter((x) => cKeep.has(x.id))
      .map((x) => mk(x.id, "c", x.ps[0]!.cname, fC.get(x.id)!, 0, x.ps[0]!.isCo ? COMPANY_COLOR : CHART_COLORS.primary));
    const restC = cRank.filter((x) => !cKeep.has(x.id));
    if (restC.length) cs.push(mk(OTH_C, "c", `${restC.length} khách hàng khác`, fC.get(OTH_C)!, 0, CHART_COLORS.axis, restC.map((r) => ({ name: r.ps[0]!.cname, v: r.v, n: r.ps.length }))));
    if (fC.has(UNLINKED)) cs.push(mk(UNLINKED, "c", "Chưa gắn biên bản", fC.get(UNLINKED)!, 0, CHART_COLORS.axis));

    const us: Node[] = uRank.filter((x) => uKeep.has(x.id)).map((x) => mk(x.id, "u", x.ps[0]!.uname, fU.get(x.id)!, 1, CHART_COLORS.dark));
    const restU = uRank.filter((x) => !uKeep.has(x.id));
    if (restU.length) us.push(mk(OTH_U, "u", `${restU.length} đơn vị khác`, fU.get(OTH_U)!, 1, CHART_COLORS.axis, restU.map((r) => ({ name: r.ps[0]!.uname, v: r.v, n: r.ps.length }))));

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
          links.push({ key: `${c.id}|${uid}`, a: c, b, v, flows: fl, d: ribbon(c, b, v), color: c.color });
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
          links.push({ key: `${u.id}|${s}`, a: u, b, v, flows: fl, d: ribbon(u, b, v), color: STATUS_COLOR[s as RecStatus] });
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
    if (!sel || !model) return null;
    const s = new Set(model.flows.filter((f) => (sel.kind === "c" ? f.c === sel.id : sel.kind === "u" ? f.u === sel.id : f.s === sel.id)));
    return s.size ? s : null;
  }, [sel, model]);

  const toggleSel = (kind: Kind, id: string) => setSel((cur) => (cur && cur.kind === kind && cur.id === id ? null : { kind, id }));
  const move = (e: React.MouseEvent, t: { node?: Node; link?: LinkG }) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setTip({ x: Math.max(4, Math.min(e.clientX - r.left + 14, r.width - 250)), y: e.clientY - r.top + 14, ...t });
  };

  const sub = (n: Node) =>
    n.kind === "c"
      ? n.id === UNLINKED
        ? `${fmt(n.v, metric)} · ${formatNumber(n.n)} tour`
        : `${fmt(n.v, metric)} · ${formatNumber(n.contracts)} HĐ / ${formatNumber(n.n)} tour`
      : n.kind === "u"
        ? `${fmt(n.v, metric)} · ${formatNumber(n.n)} lần tour`
        : `${fmt(n.v, metric)} · ${formatNumber(n.n)} tour`;

  const seg = (on: boolean) => cn("rounded-md px-2.5 py-1 text-xs font-medium transition-colors", on ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary/60");

  const nodeFill = (n: Node) => (n.kind === "u" ? "var(--secondary)" : `color-mix(in oklab, ${n.color} ${n.kind === "c" && n.color === CHART_COLORS.axis ? 14 : 20}%, transparent)`);

  const summary = useMemo(() => {
    if (!sel || !hl || !model) return null;
    const all = [...model.cs, ...model.us, ...model.ss];
    const node = all.find((n) => n.kind === sel.kind && n.id === sel.id);
    const byId = new Map(all.map((n) => [`${n.kind}:${n.id}`, n]));
    const groupKind: Kind = sel.kind === "u" ? "c" : "u";
    const m = new Map<string, number>();
    hl.forEach((f) => {
      const id = groupKind === "c" ? f.c : f.u;
      m.set(id, (m.get(id) ?? 0) + 1);
    });
    const items = [...m.entries()]
      .map(([id, n]) => ({ name: byId.get(`${groupKind}:${id}`)?.name ?? id, n }))
      .sort((a, b) => b.n - a.n);
    const lead = sel.kind === "c" ? "Đơn vị sử dụng của" : sel.kind === "u" ? "Khách hàng nghiệm thu của" : "Đơn vị có tour";
    return { lead, name: node?.name ?? "", items, total: hl.size };
  }, [sel, hl, model]);

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
                  setSel(null);
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

      <div ref={wrap} className="w-full" />
      {model && (
        <div ref={box} className={cn("relative", showAll && "max-h-[640px] overflow-y-auto")} onMouseLeave={() => setTip(null)}>
          <svg width={W} height={model.H} viewBox={`0 0 ${W} ${model.H}`} className="block" role="img" aria-label="Sankey khách hàng nghiệm thu, đơn vị sử dụng, trạng thái nghiệm thu">
            {[
              { x: COLS[0]!.x, a: "start" as const, t: "Khách hàng nghiệm thu", c: `${formatNumber(model.nCo)} công ty${model.nSch ? ` + ${formatNumber(model.nSch)} trường` : ""}` },
              { x: COLS[1]!.x, a: "start" as const, t: "Đơn vị sử dụng", c: `${formatNumber(model.nU)} đơn vị` },
              { x: W, a: "end" as const, t: "Trạng thái nghiệm thu", c: STATUS_ORDER.map((s) => `${formatNumber(model.st[s])} ${STATUS_SHORT[s]}`).join(" / ") },
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
              const on = !hl || l.flows.some((f) => hl.has(f));
              return (
                <path
                  key={l.key}
                  d={l.d}
                  fill={l.color}
                  opacity={on ? (hl ? 0.55 : 0.3) : 0.05}
                  onMouseMove={(e) => move(e, { link: l })}
                  onMouseLeave={() => setTip(null)}
                />
              );
            })}
            {[...model.cs, ...model.us, ...model.ss].map((n) => {
              const on = !hl || n.flows.some((f) => hl.has(f));
              const picked = sel?.kind === n.kind && sel.id === n.id;
              const room = n.w - 16;
              const two = n.h >= 32;
              return (
                <g
                  key={`${n.kind}:${n.id}`}
                  style={{ cursor: "pointer" }}
                  opacity={on ? 1 : 0.28}
                  onClick={() => toggleSel(n.kind, n.id)}
                  onMouseMove={(e) => move(e, { node: n })}
                  onMouseLeave={() => setTip(null)}
                >
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={3} fill={nodeFill(n)} stroke={picked ? "var(--foreground)" : n.kind === "u" ? "var(--border)" : n.color} strokeWidth={picked ? 2 : 0.8} />
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

          {tip && (tip.node || tip.link) && (
            <div className="pointer-events-none absolute z-20 w-60" style={{ left: tip.x, top: tip.y }}>
              {tip.node ? (
                <TooltipBox label={tip.node.name}>
                  <p>
                    {METRIC_LABEL[metric]}: <b>{fmt(tip.node.v, metric)}</b>
                    {model.total ? ` (${formatNumber(Math.round((tip.node.v / model.total) * 100))}% tổng)` : ""}
                  </p>
                  <p>Số hợp đồng: {tip.node.kind === "s" || tip.node.id === UNLINKED ? "—" : formatNumber(tip.node.contracts)}</p>
                  <p>Số tour: {formatNumber(tip.node.n)}</p>
                  <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">
                    {STATUS_ORDER.map((s) => `${STATUS_SHORT[s]} ${formatNumber(statusCounts(tip.node!.flows)[s])}`).join(" · ")}
                  </p>
                  {tip.node.members && (
                    <div className="mt-1 border-t border-dashed border-border pt-1">
                      {tip.node.members.slice(0, 8).map((m) => (
                        <p key={m.name} className="flex justify-between gap-2">
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
                  <p>
                    {METRIC_LABEL[metric]}: <b>{fmt(tip.link.v, metric)}</b>
                  </p>
                  <p>Số tour: {formatNumber(tip.link.flows.length)}</p>
                  <p className="mt-1 border-t border-dashed border-border pt-1 text-muted-foreground">
                    {STATUS_ORDER.map((s) => `${STATUS_SHORT[s]} ${formatNumber(statusCounts(tip.link!.flows)[s])}`).join(" · ")}
                  </p>
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
          <button type="button" onClick={() => setSel(null)} className="ml-1 text-muted-foreground underline">
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
        <span>Độ dày dải theo {METRIC_LABEL[metric].toLowerCase()}. Loại khách hàng: tên khách hàng chứa "Công ty" là Công ty, còn lại là Trường trực tiếp.</span>
      </div>
    </Panel>
  );
}
