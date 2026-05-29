import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
          isUser ? (
            <div className="whitespace-pre-wrap break-words">{msg.content}</div>
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Style code blocks
                code: ({ className, children, ...props }) => {
                  const isInline = !className;
                  if (isInline) {
                    return (
                      <code
                        className="px-1.5 py-0.5 rounded text-xs font-mono"
                        style={{
                          backgroundColor: "var(--surface-card)",
                          color: "var(--color-copper)",
                        }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <code
                      className="block px-3 py-2 rounded-lg text-xs font-mono overflow-x-auto"
                      style={{
                        backgroundColor: "var(--color-ink)",
                        color: "var(--color-cream)",
                      }}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre: ({ children }) => (
                  <pre
                    className="my-2 rounded-lg overflow-x-auto"
                    style={{ backgroundColor: "var(--color-ink)" }}
                  >
                    {children}
                  </pre>
                ),
                // Style links
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--color-copper)" }}
                    className="underline underline-offset-2"
                  >
                    {children}
                  </a>
                ),
                // Style lists
                ul: ({ children }) => (
                  <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>
                ),
                // Style headings
                h1: ({ children }) => <h1 className="text-lg font-bold my-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-bold my-1.5">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-bold my-1">{children}</h3>,
                // Style blockquotes
                blockquote: ({ children }) => (
                  <blockquote
                    className="border-l-2 pl-3 my-1 italic"
                    style={{ borderColor: "var(--color-copper)", color: "var(--text-secondary)" }}
                  >
                    {children}
                  </blockquote>
                ),
                // Style tables
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="min-w-full text-xs border-collapse">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th
                    className="px-2 py-1 text-left font-medium"
                    style={{
                      backgroundColor: "var(--surface-card)",
                      borderBottom: "var(--border-medium)",
                    }}
                  >
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-2 py-1" style={{ borderBottom: "var(--border-light)" }}>
                    {children}
                  </td>
                ),
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )
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
