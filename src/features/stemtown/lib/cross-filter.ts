import { useCallback, useMemo, useState } from "react";

/** Bộ lọc chéo đa chiều: mỗi chiều (dim) giữ tối đa một giá trị đang chọn. */
export type Selection = Record<string, string | null>;

export type CrossChip = { dim: string; label: string };

export function useCrossFilter(labels: Record<string, string>) {
  const [sel, setSel] = useState<Selection>({});

  const toggle = useCallback((dim: string, value?: string | number | null) => {
    if (value === null || value === undefined || value === "") return;
    const v = String(value);
    setSel((s) => ({ ...s, [dim]: s[dim] === v ? null : v }));
  }, []);

  const clear = useCallback((dim: string) => {
    setSel((s) => ({ ...s, [dim]: null }));
  }, []);

  const clearAll = useCallback(() => setSel({}), []);

  const chips = useMemo<CrossChip[]>(
    () =>
      Object.entries(sel)
        .filter(([, v]) => Boolean(v))
        .map(([dim, v]) => ({ dim, label: `${labels[dim] ?? dim}: ${v}` })),
    [sel, labels],
  );

  return { sel, toggle, clear, clearAll, chips };
}

/** true khi chưa chọn gì ở chiều đó hoặc giá trị khớp lựa chọn. */
export const matchSel = (value: string | null | undefined, selected: string | null | undefined) =>
  !selected || value === selected;

/** Màu cột: làm mờ những cột không được chọn khi đang có lọc chéo ở chiều đó. */
export const cellFill = (
  name: string,
  selected: string | null | undefined,
  active: string,
  dimmed = "var(--brand-support)",
) => (selected && selected !== name ? dimmed : active);
