import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cloneElement, isValidElement } from "react";

interface DocViewerModalProps {
  filename: string;
  content: string;
  /** 问题关键词 → 只在顶部面板显示为标签 */
  questionKeywords: string[];
  /** 来源片段关键词 → 只在文档正文中高亮 */
  highlightKeywords: string[];
  onClose: () => void;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(text: string, keywords: string[]): React.ReactNode {
  if (!keywords.length) return text;
  const unique = [...new Set(keywords.filter((k) => k.length >= 2))];
  if (!unique.length) return text;

  const pattern = unique.map(escapeRegex).join("|");
  const regex = new RegExp(`(${pattern})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, i) => {
    if (regex.test(part)) {
      regex.lastIndex = 0;
      return (
        <mark
          key={i}
          style={{
            backgroundColor: "rgba(193, 126, 67, 0.2)",
            color: "var(--text-primary)",
            borderRadius: "2px",
            padding: "0 1px",
          }}
        >
          {part}
        </mark>
      );
    }
    return part;
  });
}

export default function DocViewerModal({
  filename,
  content,
  questionKeywords,
  highlightKeywords,
  onClose,
}: DocViewerModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in"
      style={{
        backgroundColor: "var(--overlay-heavy)",
        backdropFilter: "blur(3px)",
      }}
      onClick={onClose}
    >
      <div
        className="card w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden animate-fade-in-up"
        style={{ animationDelay: "50ms" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "var(--border-light)" }}
        >
          <div>
            <h3 className="display-text text-base" style={{ color: "var(--text-primary)" }}>
              {filename}
            </h3>
            {questionKeywords.length > 0 && (
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                <span className="font-medium">问题关键词：</span>
                {questionKeywords.map((kw) => (
                  <span
                    key={kw}
                    className="inline-block ml-1 px-1.5 py-0.5 rounded text-[11px]"
                    style={{
                      backgroundColor: "rgba(193, 126, 67, 0.12)",
                      color: "var(--color-copper)",
                    }}
                  >
                    {kw}
                  </span>
                ))}
              </p>
            )}
            {highlightKeywords.length > 0 && (
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                <span className="font-medium">来源匹配：</span>
                <span className="ml-1">
                  {highlightKeywords.slice(0, 12).join("、")}
                  {highlightKeywords.length > 12 ? ` 等 ${highlightKeywords.length} 词` : ""}
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            className="text-xl leading-none p-1 rounded transition-colors shrink-0"
            style={{ color: "var(--text-muted)" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Content — 用 highlightKeywords 高亮文档中与答案来源相关的词句 */}
        <div
          className="flex-1 overflow-y-auto px-8 py-6 text-sm leading-relaxed"
          style={{ color: "var(--text-primary)" }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code: ({ className, children, ...props }) => {
                const isInline = !className;
                if (isInline) {
                  return (
                    <code
                      className="px-1.5 py-0.5 rounded text-xs font-mono"
                      style={{ backgroundColor: "var(--surface-bg)", color: "var(--color-copper)" }}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                }
                return (
                  <pre
                    className="rounded-lg overflow-x-auto my-3 px-4 py-3 text-xs font-mono"
                    style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
                  >
                    <code {...props}>{children}</code>
                  </pre>
                );
              },
              p: ({ children }) => {
                if (typeof children === "string") {
                  return <p className="my-2">{highlightText(children, highlightKeywords)}</p>;
                }
                const text = extractTextContent(children);
                if (
                  text &&
                  highlightKeywords.some((kw) => text.toLowerCase().includes(kw.toLowerCase()))
                ) {
                  return <p className="my-2">{highlightParagraph(children, highlightKeywords)}</p>;
                }
                return <p className="my-2">{children}</p>;
              },
              h1: ({ children }) => <h1 className="text-xl font-bold my-4">{children}</h1>,
              h2: ({ children }) => <h2 className="text-lg font-bold my-3">{children}</h2>,
              h3: ({ children }) => <h3 className="text-base font-bold my-2">{children}</h3>,
              ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
              ol: ({ children }) => (
                <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
              ),
              blockquote: ({ children }) => (
                <blockquote
                  className="border-l-2 pl-4 my-3 italic"
                  style={{ borderColor: "var(--color-copper)", color: "var(--text-secondary)" }}
                >
                  {children}
                </blockquote>
              ),
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
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function extractTextContent(children: React.ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextContent).join("");
  if (children && typeof children === "object" && "props" in children) {
    const props = (children as { props?: { children?: React.ReactNode } }).props;
    if (props?.children) return extractTextContent(props.children);
  }
  return "";
}

function highlightParagraph(children: React.ReactNode, keywords: string[]): React.ReactNode {
  if (typeof children === "string") return highlightText(children, keywords);
  if (Array.isArray(children)) {
    return children.map((child, i) => <span key={i}>{highlightParagraph(child, keywords)}</span>);
  }
  if (isValidElement(children)) {
    const el = children as React.ReactElement<{ children?: React.ReactNode }>;
    if (el.props.children) {
      return cloneElement(el, {
        children: highlightParagraph(el.props.children, keywords),
      });
    }
  }
  return children;
}
