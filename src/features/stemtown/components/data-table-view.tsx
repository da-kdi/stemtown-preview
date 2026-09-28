import { ArrowDownUp, Columns3, Download, Filter, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { Column } from "@/features/stemtown/components/fact-table";
import { formatNumber } from "@/features/stemtown/lib/format";
import { cn } from "@/lib/utils";

const parseNum = (v: string) => {
  const n = Number(v.replace(/[^\d,-]/g, "").replace(/,/g, "."));
  return Number.isFinite(n) ? n : 0;
};

/** Bảng dữ liệu đầy đủ: tìm kiếm, lọc từng cột, sắp xếp, ẩn/hiện cột, xuất Excel/CSV. */
export function DataTableView<T>({
  columns,
  rows,
  fileName,
  pageSize = 50,
}: {
  columns: Column<T>[];
  rows: T[];
  fileName: string;
  pageSize?: number;
}) {
  const [visible, setVisible] = useState<string[]>(columns.map((c) => c.key));
  const [showColPicker, setShowColPicker] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [limit, setLimit] = useState(pageSize);

  const cols = useMemo(() => columns.filter((c) => visible.includes(c.key)), [columns, visible]);

  const options = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const c of cols) {
      map[c.key] = Array.from(new Set(rows.map((r) => c.render(r)))).sort((a, b) =>
        a.localeCompare(b, "vi"),
      );
    }
    return map;
  }, [cols, rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      for (const c of cols) {
        const f = colFilters[c.key];
        if (f && c.render(r) !== f) return false;
      }
      if (!q) return true;
      return cols.some((c) => c.render(r).toLowerCase().includes(q));
    });
  }, [rows, cols, colFilters, search]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const numeric = col.align === "right";
    const out = filtered.slice().sort((a, b) => {
      const av = col.render(a);
      const bv = col.render(b);
      return numeric ? parseNum(av) - parseNum(bv) : av.localeCompare(bv, "vi");
    });
    return sort.dir === "desc" ? out.reverse() : out;
  }, [filtered, sort, columns]);

  const exportCsv = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      cols.map((c) => escape(c.header)).join(","),
      ...sorted.map((r) => cols.map((c) => escape(c.render(r))).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm kiếm trong bảng..."
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 text-sm outline-none focus:border-ring"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium transition-colors hover:bg-secondary"
        >
          <Filter className="size-4" /> {showFilters ? "Ẩn ô lọc" : "Hiện ô lọc"}
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColPicker((v) => !v)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-input px-3 text-sm font-medium transition-colors hover:bg-secondary"
          >
            <Columns3 className="size-4" /> Ẩn/hiện cột
          </button>
          {showColPicker && (
            <div className="absolute top-11 right-0 z-30 max-h-80 w-64 overflow-auto rounded-lg border border-border bg-popover p-2 shadow-lg">
              <div className="mb-1 flex gap-2 px-1 text-xs">
                <button
                  type="button"
                  className="rounded-md border border-input px-2 py-1 hover:bg-secondary"
                  onClick={() => setVisible(columns.map((c) => c.key))}
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  className="rounded-md border border-input px-2 py-1 hover:bg-secondary"
                  onClick={() => setVisible([])}
                >
                  Bỏ chọn
                </button>
              </div>
              {columns.map((c) => (
                <label
                  key={c.key}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary"
                >
                  <input
                    type="checkbox"
                    checked={visible.includes(c.key)}
                    onChange={(e) =>
                      setVisible((prev) =>
                        e.target.checked
                          ? columns.filter((x) => prev.includes(x.key) || x.key === c.key).map((x) => x.key)
                          : prev.filter((k) => k !== c.key),
                      )
                    }
                  />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={exportCsv}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Download className="size-4" /> Xuất Excel/CSV
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-primary text-primary-foreground">
              {cols.map((c) => (
                <th
                  key={c.key}
                  className={cn("px-3 py-2.5 text-left font-semibold whitespace-nowrap", c.align === "right" && "text-right")}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="inline-flex items-center gap-1.5 hover:opacity-80"
                  >
                    {c.header}
                    <ArrowDownUp className="size-3.5 opacity-70" />
                    {sort?.key === c.key && <span className="text-xs">{sort.dir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
            </tr>
            {showFilters && (
              <tr className="border-b border-border bg-secondary/50">
                {cols.map((c) => (
                  <th key={c.key} className="px-2 py-2">
                    <select
                      value={colFilters[c.key] ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        setColFilters((prev) => ({ ...prev, [c.key]: v }));
                      }}
                      className="h-8 w-full min-w-[120px] rounded-md border border-input bg-card px-2 text-xs font-normal outline-none focus:border-ring"
                    >
                      <option value="">{`Lọc ${c.header.toLowerCase()}`}</option>
                      {(options[c.key] ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </th>
                ))}
              </tr>
            )}
            <tr className="border-b border-border bg-destructive/5 text-xs font-medium">
              {cols.map((c) => (
                <th key={c.key} className={cn("px-3 py-1.5 text-left", c.align === "right" && "text-right")}>
                  {c.align === "right"
                    ? `Σ ${formatNumber(sorted.reduce((s, r) => s + parseNum(c.render(r)), 0))}`
                    : `${formatNumber(new Set(sorted.map((r) => c.render(r))).size)} giá trị`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((r, i) => (
              <tr key={i} className="border-b border-border/60 last:border-0 hover:bg-secondary/60">
                {cols.map((c) => {
                  const value = c.render(r);
                  return (
                    <td
                      key={c.key}
                      title={value}
                      style={c.cellStyle?.(r)}
                      className={cn(
                        "px-3 py-2",
                        c.noTruncate ? "whitespace-nowrap" : "max-w-[260px] truncate",
                        c.align === "right" && "text-right tabular-nums",
                      )}
                    >
                      {value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <p className="flex h-32 items-center justify-center text-sm text-muted-foreground">
            Không có dữ liệu phù hợp
          </p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Hiển thị {Math.min(limit, sorted.length)}/{formatNumber(sorted.length)} dòng
        </span>
        {limit < sorted.length && (
          <button
            type="button"
            onClick={() => setLimit((l) => l + pageSize)}
            className="rounded-md border border-input px-2 py-1 hover:bg-secondary"
          >
            Xem thêm
          </button>
        )}
      </div>
    </section>
  );
}
