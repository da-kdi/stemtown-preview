import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

import { CustomChartCard } from "@/features/stemtown/components/CustomChartCard";
import { CustomChartDialog, type ChartForm } from "@/features/stemtown/components/CustomChartDialog";
import {
  createChart,
  deleteChart,
  listCharts,
  updateChart,
  type Dataset,
  type StemtownChart,
} from "@/features/stemtown/lib/custom-charts";

/**
 * Khu "Biểu đồ tùy chỉnh" đặt ở cuối tab B2C hoặc B2B — chỉ hiện biểu đồ của đúng
 * dataset đó; admin thấy nút "Thêm biểu đồ".
 */
export function CustomChartsSection({ dataset }: { dataset: Dataset }) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<StemtownChart | null>(null);

  const { data: allCharts = [], isLoading } = useQuery({
    queryKey: ["stemtown-charts"],
    queryFn: listCharts,
    staleTime: 60 * 1000,
  });

  const charts = allCharts.filter((c) => c.dataset === dataset && (isAdmin || c.is_active));
  const invalidate = () => void qc.invalidateQueries({ queryKey: ["stemtown-charts"] });

  const save = useMutation({
    mutationFn: async (f: ChartForm) => {
      if (editing) {
        await updateChart(editing.id, { ...f, dataset });
      } else {
        await createChart({
          ...f,
          dataset,
          sort_order: allCharts.filter((c) => c.dataset === dataset).length,
          is_active: true,
        });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Đã cập nhật biểu đồ" : "Đã thêm biểu đồ");
      setOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không lưu được biểu đồ"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteChart(id),
    onSuccess: () => {
      toast.success("Đã xóa biểu đồ");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message || "Không xóa được biểu đồ"),
  });

  // Ẩn hoàn toàn khu này với người không phải admin khi chưa có biểu đồ nào.
  if (!isAdmin && charts.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-border pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">Biểu đồ tùy chỉnh</h3>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Thêm biểu đồ
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          Đang tải biểu đồ…
        </div>
      ) : charts.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <BarChart3 className="h-7 w-7 opacity-50" />
          Chưa có biểu đồ tùy chỉnh. Bấm “Thêm biểu đồ” để tạo.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {charts.map((c) => (
            <CustomChartCard
              key={c.id}
              chart={c}
              isAdmin={isAdmin}
              onEdit={() => {
                setEditing(c);
                setOpen(true);
              }}
              onDelete={() => remove.mutate(c.id)}
            />
          ))}
        </div>
      )}

      <CustomChartDialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setEditing(null);
        }}
        editing={editing}
        fixedDataset={dataset}
        saving={save.isPending}
        onSubmit={(f) => save.mutate(f)}
      />
    </div>
  );
}
