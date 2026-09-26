import b2c from "@/features/stemtown/data/b2c.json";
import b2b from "@/features/stemtown/data/b2b.json";

/**
 * PREVIEW-ONLY STUB. The real client lives in the parent repo
 * (supabase-checker) and is NOT part of the stemtown drop-in module.
 *
 * Reproduces just the two shapes stemtown code touches:
 *  - supabase.functions.invoke("stemtown-data")  -> { b2c, b2b } sample rows
 *  - supabase.from("stemtown_charts").select/insert/update/delete/eq
 */

type ChartRow = Record<string, unknown> & { id: string; sort_order: number };
let chartsTable: ChartRow[] = [];
let nextId = 1;

function table(name: string) {
  if (name !== "stemtown_charts") throw new Error(`[mock supabase] unhandled table: ${name}`);
  return {
    select: (_cols: string) => ({
      order: async (_col: string, _opts?: unknown) => ({
        data: [...chartsTable].sort((a, b) => a.sort_order - b.sort_order),
        error: null,
      }),
    }),
    insert: async (v: Record<string, unknown>) => {
      chartsTable.push({ ...v, id: String(nextId++) } as ChartRow);
      return { error: null };
    },
    update: (v: Record<string, unknown>) => ({
      eq: async (col: string, val: string) => {
        chartsTable = chartsTable.map((r) => (r[col as keyof ChartRow] === val ? { ...r, ...v } : r));
        return { error: null };
      },
    }),
    delete: () => ({
      eq: async (col: string, val: string) => {
        chartsTable = chartsTable.filter((r) => r[col as keyof ChartRow] !== val);
        return { error: null };
      },
    }),
  };
}

export const supabase = {
  from: table,
  functions: {
    invoke: async <T,>(name: string): Promise<{ data: T | null; error: Error | null }> => {
      if (name !== "stemtown-data") return { data: null, error: new Error(`[mock supabase] unhandled fn: ${name}`) };
      // simulate network latency so loading states are visible in preview
      await new Promise((r) => setTimeout(r, 250));
      return { data: { b2c, b2b } as unknown as T, error: null };
    },
  },
};
