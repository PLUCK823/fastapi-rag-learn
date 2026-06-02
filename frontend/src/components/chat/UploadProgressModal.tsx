interface UploadItem {
  filename: string;
  taskId: string;
  status: string;
  progress: number;
  error?: string;
}

interface UploadProgressModalProps {
  items: UploadItem[];
  onClose: () => void;
}

export default function UploadProgressModal({ items, onClose }: UploadProgressModalProps) {
  const done = items.filter((q) => q.status === "done").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in"
      style={{ backgroundColor: "var(--overlay-heavy)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-md max-h-[70vh] flex flex-col overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: "var(--border-light)" }}
        >
          <h3 className="display-text text-sm" style={{ color: "var(--text-primary)" }}>
            上传进度 ({done}/{items.length})
          </h3>
          <button
            type="button"
            className="text-lg leading-none p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
          {items.map((item, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="flex items-center gap-2 text-sm">
                <span
                  className="shrink-0 w-5 text-center text-sm"
                  style={{
                    color:
                      item.status === "error"
                        ? "var(--danger)"
                        : item.status === "done"
                          ? "var(--accent-sage)"
                          : "var(--accent)",
                  }}
                >
                  {item.status === "done" ? "✓" : item.status === "error" ? "✗" : "⟳"}
                </span>
                <span
                  className="truncate flex-1"
                  style={{
                    color: item.status === "error" ? "var(--danger)" : "var(--text-primary)",
                  }}
                >
                  {item.filename}
                </span>
                {item.status === "uploading" && (
                  <span className="text-xs shrink-0" style={{ color: "var(--text-muted)" }}>
                    {item.progress}%
                  </span>
                )}
              </div>
              {item.status === "uploading" && (
                <div className="h-1.5 rounded-full overflow-hidden bg-gray-200 ml-7">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${item.progress}%`,
                      backgroundColor: "var(--accent)",
                    }}
                  />
                </div>
              )}
              {item.error && (
                <p
                  className="text-xs ml-7 truncate"
                  style={{ color: "var(--danger)" }}
                  title={item.error}
                >
                  {item.error}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
