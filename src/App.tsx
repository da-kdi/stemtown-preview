import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { AccessDenied } from "@/components/AccessDenied";
import { StemtownDashboard } from "@/features/stemtown/StemtownShell";

// Preview host: mirrors what src/routes/_authenticated/stemtown.tsx does in the
// real repo, minus TanStack Router (not needed to preview/edit this module).
const queryClient = new QueryClient();

function GuardedStemtownPage() {
  const { canViewReport, loading } = useAuth();
  if (loading) return null;
  return canViewReport("stemtown") ? <StemtownDashboard /> : <AccessDenied />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <GuardedStemtownPage />
      <Toaster richColors position="top-center" />
    </QueryClientProvider>
  );
}
