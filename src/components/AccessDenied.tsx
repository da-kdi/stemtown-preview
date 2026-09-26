export function AccessDenied() {
  return (
    <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
      <p className="text-lg font-semibold">Bạn không có quyền xem báo cáo này</p>
      <p className="text-sm text-muted-foreground">Liên hệ quản trị viên để được cấp quyền.</p>
    </div>
  );
}
