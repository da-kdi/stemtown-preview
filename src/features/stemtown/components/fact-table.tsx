import { Download, SlidersHorizontal } from "lucide-react";
import { useMemo, useState, type CSSProperties } from "react";

import { EMPTY_TEXT } from "@/features/stemtown/components/panel";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T) => string;
  align?: "right";
  /** Style riêng cho ô (vd tô vàng dòng "Công ty") — không ảnh hưởng giá trị CSV/sort/filter. */
  cellStyle?: (row: T) => CSSProperties | undefined;
  /** Hiển thị toàn bộ nội dung, không cắt "..." (vd Tên khách hàng dài) — cuộn ngang bảng nếu cần. */
  noTruncate?: boolean;
};

export function FactTable<T>({
  title,
  subtitle,
  columns,
  rows,
  fileName,
  pageSize = 12,
}: {
  title: string;
  subtitle?: string;
  columns: Column<T>[];
  rows: T[];
  fileName: string;
  pageSize?: number;
}) {
  const [visible, setVisible] = useState<string[]>(columns.map((c) => c.key));
  const [showPicker, setShowPicker] = useState(false);
  const [limit, setLimit] = useState(pageSize);

  const cols = useMemo(() => columns.filter((c) => visible.includes(c.key)), [columns, visible]);

  const exportCsv = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csv = [
      cols.map((c) => escape(c.header)).join(","),
      ...rows.map((r) => cols.map((c) => escape(c.render(r))).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-xs">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPicker((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-xs font-medium transition-colors hover:bg-secondary"
          >
            <SlidersHorizontal className="size-3.5" /> Chọn cột
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Download className="size-3.5" /> Xuất CSV
          </button>
          {showPicker && (
            <div className="absolute top-9 right-0 z-20 w-56 rounded-lg border border-border bg-popover p-2 shadow-lg">
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
                        e.target.checked ? [...prev, c.key] : prev.filter((k) => k !== c.key),
                      )
                    }
                  />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="flex h-32 items-center justify-center text-sm text-muted-foreground">{EMPTY_TEXT}</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  {cols.map((c) => (
                    <th
                      key={c.key}
                      className={cn("px-3 py-2 font-medium whitespace-nowrap", c.align === "right" && "text-right")}
                    >
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((r, i) => (
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
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Hiển thị {Math.min(limit, rows.length)}/{rows.length} dòng
            </span>
            {limit < rows.length && (
              <button
                type="button"
                onClick={() => setLimit((l) => l + pageSize)}
                className="rounded-md border border-input px-2 py-1 hover:bg-secondary"
              >
                Xem thêm
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
