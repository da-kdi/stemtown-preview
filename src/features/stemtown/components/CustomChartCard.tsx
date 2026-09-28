import { Pencil, Trash2 } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import {
  CHART_COLORS,
  DONUT_COLORS,
  TooltipBox,
  TooltipRow,
  axisProps,
  shortLabel,
} from "@/features/stemtown/components/chart-kit";
import { formatNumber } from "@/features/stemtown/lib/format";
import { aggregateChart, measureUnit, type StemtownChart } from "@/features/stemtown/lib/custom-charts";

export function CustomChartCard({
  chart,
  isAdmin,
  onEdit,
  onDelete,
}: {
  chart: StemtownChart;
  isAdmin: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const data = aggregateChart(chart);
  const unit = measureUnit(chart.dataset, chart.measure);
  const fmt = (v: number) => (unit === "đ" ? shortLabel(v) : formatNumber(v));

  const renderTip = (name: unknown, value: unknown) => (
    <TooltipBox label={String(name ?? "")}>
      <TooltipRow name={chart.title} value={Number(value ?? 0)} unit={unit} />
    </TooltipBox>
  );
  // param để any cho khớp type ContentType của recharts (exactOptionalPropertyTypes)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tipContent = (props: any) => {
    const payload = props?.payload as Array<{ payload?: { name?: string; value?: number } }> | undefined;
    return props?.active && payload && payload.length
      ? renderTip(payload[0]?.payload?.name, payload[0]?.payload?.value)
      : null;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-base">{chart.title}</CardTitle>
          {chart.description && (
            <p className="mt-1 text-xs text-muted-foreground">{chart.description}</p>
          )}
        </div>
        {isAdmin && (
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Sửa">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete} title="Xóa">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="h-72">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Không có dữ liệu phù hợp.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {chart.chart_type === "line" ? (
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis tickFormatter={fmt} {...axisProps} width={64} />
                <Tooltip content={tipContent} />
                <Line type="monotone" dataKey="value" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
              </LineChart>
            ) : chart.chart_type === "area" ? (
              <AreaChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis tickFormatter={fmt} {...axisProps} width={64} />
                <Tooltip content={tipContent} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={CHART_COLORS.primary}
                  fill={CHART_COLORS.primary}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              </AreaChart>
            ) : chart.chart_type === "pie" ? (
              <PieChart>
                <Tooltip content={tipContent} />
                <Pie data={data} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
                  {data.map((d, i) => (
                    <Cell key={d.name} fill={DONUT_COLORS[i % DONUT_COLORS.length] as string} />
                  ))}
                </Pie>
              </PieChart>
            ) : chart.chart_type === "hbar" ? (
              <BarChart data={data} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
                <XAxis type="number" tickFormatter={fmt} {...axisProps} />
                <YAxis type="category" dataKey="name" {...axisProps} width={120} />
                <Tooltip content={tipContent} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[0, 4, 4, 0]} />
              </BarChart>
            ) : (
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis tickFormatter={fmt} {...axisProps} width={64} />
                <Tooltip content={tipContent} cursor={{ fill: "var(--muted)" }} />
                <Bar dataKey="value" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
