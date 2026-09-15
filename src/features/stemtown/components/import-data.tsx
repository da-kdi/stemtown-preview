import { Download, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  clearImportedB2B,
  downloadB2BTemplate,
  parseB2BFile,
  saveImportedB2B,
} from "@/features/stemtown/lib/b2b-import";

type Props = {
  /** Gọi lại sau khi import/reset thành công để dashboard tính lại dữ liệu */
  onImported: (rows: Record<string, unknown>[] | null) => void;
  imported: boolean;
};

export function ImportDataBar({ onImported, imported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function handleFile(file: File) {
    try {
      const { rows, missing } = await parseB2BFile(file);
      saveImportedB2B(rows);
      onImported(rows);
      setStatus({
        kind: "ok",
        text:
          `Đã nhập ${rows.length} dòng từ "${file.name}".` +
          (missing.length ? ` Thiếu cột: ${missing.join(", ")}.` : ""),
      });
    } catch (err) {
      setStatus({ kind: "error", text: err instanceof Error ? err.message : "Không đọc được file." });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3">
      <div className="mr-auto">
        <p className="text-sm font-semibold">Cập nhật dữ liệu B2B</p>
        <p className="text-xs text-muted-foreground">
          Tải template, điền dữ liệu theo đúng cột rồi import file CSV/JSON.
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.json,text/csv,application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = "";
        }}
      />

      <Button variant="outline" size="sm" onClick={() => downloadB2BTemplate()}>
        <Download className="size-4" /> Template Data
      </Button>
      <Button size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" /> Import Data
      </Button>
      {imported && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            clearImportedB2B();
            onImported(null);
            setStatus({ kind: "ok", text: "Đã khôi phục dữ liệu mẫu ban đầu." });
          }}
        >
          <RotateCcw className="size-4" /> Dùng lại dữ liệu mẫu
        </Button>
      )}

      {status && (
        <p
          className={`w-full text-xs ${status.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
