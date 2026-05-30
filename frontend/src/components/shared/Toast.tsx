import { useToastStore } from "../../stores/toastStore";

const typeStyles: Record<string, { bg: string; border: string; icon: string }> = {
  error: {
    bg: "rgba(181,91,91,0.12)",
    border: "rgba(181,91,91,0.35)",
    icon: "✕",
  },
  success: {
    bg: "rgba(91,143,91,0.12)",
    border: "rgba(91,143,91,0.35)",
    icon: "✓",
  },
  info: {
    bg: "rgba(125,125,160,0.12)",
    border: "rgba(125,125,160,0.35)",
    icon: "i",
  },
};

export default function Toast() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const s = typeStyles[t.type] ?? typeStyles.error;
        return (
          <div
            key={t.id}
            className="flex items-start gap-3 px-4 py-3 rounded-xl text-sm animate-fade-in-up shadow-lg backdrop-blur-sm"
            style={{
              backgroundColor: s.bg,
              border: `1px solid ${s.border}`,
              color: "var(--text-primary)",
            }}
          >
            <span
              className="shrink-0 flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold"
              style={{
                backgroundColor: s.border,
                color: "var(--color-cream)",
              }}
            >
              {s.icon}
            </span>
            <span className="flex-1 leading-snug">{t.message}</span>
            <button
              type="button"
              className="shrink-0 text-sm opacity-50 hover:opacity-100 transition-opacity leading-none"
              style={{ color: "var(--text-muted)" }}
              onClick={() => remove(t.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
