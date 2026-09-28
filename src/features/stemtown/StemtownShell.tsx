import { useState } from "react";
import { AlertTriangle, Building2, LayoutGrid, Loader2, RotateCcw, ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { loadStemtownData } from "@/features/stemtown/lib/data-source";
import { OverviewPage } from "@/features/stemtown/views/overview";
import { B2CPage } from "@/features/stemtown/views/b2c";
import { B2BPage } from "@/features/stemtown/views/b2b";

const TABS = [
  { key: "overview", label: "Tổng quan", icon: LayoutGrid, render: () => <OverviewPage /> },
  { key: "b2c", label: "B2C - Khách lẻ", icon: ShoppingBag, render: () => <B2CPage /> },
  { key: "b2b", label: "B2B - Khách đoàn", icon: Building2, render: () => <B2BPage /> },
] as const;

/**
 * Dashboard STEM TOWN — nạp dữ liệu từ Google Sheet rồi render 3 view.
 * Tối ưu: giữ tab đã mở trong DOM (không dựng lại mỗi lần đổi tab -> đổi tức thì);
 * gắn dataUpdatedAt vào key nên khi "Làm mới dữ liệu" thì tab đang xem tự cập nhật ngay.
 */
export function StemtownDashboard() {
  const { isLoading, isError, error, isSuccess, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ["stemtown-data"],
    queryFn: loadStemtownData,
    // Giữ dữ liệu trong bộ nhớ suốt phiên làm việc: không tự hết hạn (staleTime) và
    // không bị dọn khỏi cache (gcTime) khi rời tab rồi quay lại — chỉ tải lại thật sự
    // khi F5 (QueryClient được tạo mới hoàn toàn) hoặc khi bấm nút "Làm mới dữ liệu".
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const [active, setActive] = useState<string>("overview");
  const [visited, setVisited] = useState<Record<string, boolean>>({ overview: true });

  const show = (k: string) => {
    setActive(k);
    setVisited((v) => (v[k] ? v : { ...v, [k]: true }));
  };

  return (
    <div className="stemtown-scope space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">STEM TOWN</h1>
          <p className="text-sm text-muted-foreground">
            Báo cáo doanh thu STEM TOWN - B2C (nguồn SAPO) &amp; B2B (nguồn Super App)
          </p>
        </div>
        {isSuccess && (
          <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RotateCcw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} /> Làm mới dữ liệu
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Đang đồng bộ dữ liệu từ các nguồn..
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6">
          <div className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-5 w-5" /> Không tải được dữ liệu từ Google Sheet
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : "Lỗi không xác định."}
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => void refetch()}>
            <RotateCcw className="mr-2 h-4 w-4" /> Thử lại
          </Button>
        </div>
      )}

      {isSuccess && (
        <>
          <div className="inline-flex items-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
            {TABS.map((t) => {
              const isActive = active === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => show(t.key)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "hover:text-foreground",
                  )}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            {TABS.map((t) =>
              visited[t.key] ? (
                // key kèm dataUpdatedAt: refetch -> remount -> tính lại số mới ngay trên tab đang xem
                <div key={`${t.key}-${dataUpdatedAt}`} hidden={active !== t.key}>
                  {t.render()}
                </div>
              ) : null,
            )}
          </div>
        </>
      )}
    </div>
  );
}
