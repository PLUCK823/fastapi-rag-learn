import type { Message } from "../../types";

export default function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex mb-4 ${isUser ? "justify-end" : "justify-start"} animate-fade-in-up`}>
      <div
        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser ? "rounded-br-md" : "rounded-bl-md"
        }`}
        style={
          isUser
            ? {
                backgroundColor: "var(--color-ink)",
                color: "var(--color-cream)",
              }
            : {
                backgroundColor: "var(--surface-bg)",
                color: "var(--text-primary)",
                border: "var(--border-light)",
              }
        }
      >
        {msg.content ? (
          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
        ) : msg.isStreaming ? (
          <span className="inline-block animate-pulse-soft">▊</span>
        ) : null}

        {/* Sources */}
        {msg.sources && msg.sources.length > 0 && (
          <div
            className="mt-3 pt-3 flex flex-wrap gap-1.5"
            style={{
              borderTop: isUser ? "1px solid rgba(255,255,255,0.15)" : "var(--border-light)",
            }}
          >
            {msg.sources.map((s) => (
              <span
                key={s.index}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
                style={
                  isUser
                    ? {
                        backgroundColor: "rgba(255,255,255,0.1)",
                        color: "rgba(255,255,255,0.7)",
                      }
                    : {
                        backgroundColor: "var(--surface-card)",
                        color: "var(--text-muted)",
                        border: "var(--border-light)",
                      }
                }
              >
                <span
                  className="font-medium"
                  style={{ color: isUser ? "rgba(255,255,255,0.9)" : "var(--accent)" }}
                >
                  [{s.index}]
                </span>
                {s.document_name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
