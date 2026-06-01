interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: "var(--overlay)", backdropFilter: "blur(2px)" }}
      role="dialog"
      aria-modal="true"
      onClick={onCancel}
    >
      <div
        className="card p-6 w-full max-w-sm animate-fade-in-up"
        style={{ animationDelay: "50ms" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
            style={{
              backgroundColor: danger ? "var(--danger-bg)" : "var(--surface-bg)",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke={danger ? "var(--danger)" : "var(--color-copper)"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              role="img"
              aria-label="确认"
            >
              <title>确认</title>
              {danger ? (
                <>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </>
              ) : (
                <>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </>
              )}
            </svg>
          </div>
          <h2 className="display-text text-base" style={{ color: "var(--text-primary)" }}>
            {title}
          </h2>
        </div>

        <p
          className="text-sm mb-6 pl-1"
          style={{ color: "var(--text-secondary)", lineHeight: "1.6" }}
        >
          {message}
        </p>

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: "var(--surface-bg)",
              color: "var(--text-secondary)",
              border: "var(--border-medium)",
            }}
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={
              danger
                ? {
                    backgroundColor: "var(--danger)",
                    color: "var(--color-cream)",
                  }
                : {
                    backgroundColor: "var(--color-ink)",
                    color: "var(--color-cream)",
                  }
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
