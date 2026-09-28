import { createFileRoute } from "@tanstack/react-router";

import { useAuth } from "@/hooks/useAuth";
import { AccessDenied } from "@/components/AccessDenied";
import { StemtownDashboard } from "@/features/stemtown/StemtownShell";

export const Route = createFileRoute("/_authenticated/stemtown")({
  head: () => ({
    meta: [
      { title: "STEM TOWN | KDI Báo cáo" },
      {
        name: "description",
        content:
          "Dashboard doanh thu STEM TOWN: B2C bán hàng và B2B trường học, theo sản phẩm, chi nhánh và thời gian.",
      },
      { property: "og:title", content: "STEM TOWN | KDI Báo cáo" },
      {
        property: "og:description",
        content: "Theo dõi doanh thu STEM TOWN theo kênh B2C/B2B.",
      },
    ],
  }),
  component: GuardedStemtownPage,
});

/** Chỉ tài khoản được phân quyền báo cáo STEM TOWN mới xem được. */
function GuardedStemtownPage() {
  const { canViewReport, loading } = useAuth();
  if (loading) return null;
  return canViewReport("stemtown") ? <StemtownDashboard /> : <AccessDenied />;
}
