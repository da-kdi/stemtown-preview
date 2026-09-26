/**
 * PREVIEW-ONLY STUB. The real `useAuth` lives in the parent repo
 * (supabase-checker) and is NOT part of the stemtown drop-in module.
 * This stub reproduces the interface consumed by stemtown code
 * (canViewReport, loading, isAdmin) so the module can render standalone.
 *
 * Toggle admin mode for preview: add ?admin=1 to the URL.
 */
export function useAuth() {
  const isAdmin = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("admin") === "1";

  return {
    loading: false,
    isAdmin,
    canViewReport: (_reportType: string) => true,
  };
}
