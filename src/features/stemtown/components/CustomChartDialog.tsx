import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  CHART_TYPES,
  DIMENSIONS,
  MEASURES,
  type ChartType,
  type Dataset,
  type StemtownChart,
} from "@/features/stemtown/lib/custom-charts";

export type ChartForm = {
  title: string;
  description: string;
  dataset: Dataset;
  dimension: string;
  measure: string;
  chart_type: ChartType;
};

export function CustomChartDialog({
  open,
  onOpenChange,
  editing,
  fixedDataset,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: StemtownChart | null;
  /** Khi mở từ tab B2C/B2B, khóa dataset theo tab đó (ẩn ô chọn). */
  fixedDataset?: Dataset;
  saving: boolean;
  onSubmit: (f: ChartForm) => void;
}) {
  const baseDataset: Dataset = fixedDataset ?? "b2c";
  const [form, setForm] = useState<ChartForm>({
    title: "",
    description: "",
    dataset: baseDataset,
    dimension: DIMENSIONS[baseDataset][0]!.key,
    measure: MEASURES[baseDataset][0]!.key,
    chart_type: "bar",
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        title: editing.title,
        description: editing.description ?? "",
        dataset: editing.dataset,
        dimension: editing.dimension,
        measure: editing.measure,
        chart_type: editing.chart_type,
      });
    } else {
      const ds = fixedDataset ?? "b2c";
      setForm({
        title: "",
        description: "",
        dataset: ds,
        dimension: DIMENSIONS[ds][0]!.key,
        measure: MEASURES[ds][0]!.key,
        chart_type: "bar",
      });
    }
  }, [open, editing, fixedDataset]);

  const setDataset = (ds: Dataset) =>
    setForm((f) => ({
      ...f,
      dataset: ds,
      dimension: DIMENSIONS[ds][0]!.key,
      measure: MEASURES[ds][0]!.key,
    }));

  const canSave = form.title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="stemtown-scope sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Sửa biểu đồ" : "Thêm biểu đồ"}</DialogTitle>
          <DialogDescription>
            Chọn chiều phân tích, số đo và loại biểu đồ. Biểu đồ được lưu và mọi người xem được.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Tên biểu đồ</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="VD: Doanh thu theo nhân viên"
            />
          </div>

          <div className="space-y-2">
            <Label>Mô tả (không bắt buộc)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Dòng chú thích hiển thị dưới tên biểu đồ."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {!fixedDataset && (
              <div className="space-y-2">
                <Label>Tập dữ liệu</Label>
                <Select value={form.dataset} onValueChange={(v) => setDataset(v as Dataset)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="b2c">B2C - Bán hàng</SelectItem>
                    <SelectItem value="b2b">B2B - Trường học</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Loại biểu đồ</Label>
              <Select value={form.chart_type} onValueChange={(v) => setForm({ ...form, chart_type: v as ChartType })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHART_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Chiều (nhóm theo)</Label>
              <Select value={form.dimension} onValueChange={(v) => setForm({ ...form, dimension: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIMENSIONS[form.dataset].map((d) => (
                    <SelectItem key={d.key} value={d.key}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Số đo</Label>
              <Select value={form.measure} onValueChange={(v) => setForm({ ...form, measure: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASURES[form.dataset].map((m) => (
                    <SelectItem key={m.key} value={m.key}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button disabled={!canSave || saving} onClick={() => onSubmit(form)}>
            {saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : "Thêm biểu đồ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
