import { useCallback } from "react";
import type { Document, KBDetail } from "../../types";

interface KBStats {
  doc_count: number;
  chunk_count: number;
  session_count: number;
  message_count: number;
}

interface DashboardViewProps {
  kb: KBDetail | null;
  kbStats: KBStats;
  docs: Document[];
  onQuestionSelect: (question: string) => void;
}

export default function DashboardView({ kb, kbStats, docs, onQuestionSelect }: DashboardViewProps) {
  const handleQuestionClick = useCallback(
    (q: string) => {
      onQuestionSelect(q);
    },
    [onQuestionSelect],
  );

  return (
    <div className="text-center py-10 animate-fade-in-up">
      {/* Icon */}
      <div
        className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
        style={{ backgroundColor: "var(--surface-bg)" }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.25"
          role="img"
          aria-label="对话"
        >
          <title>对话</title>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      <p className="display-text text-sm mb-3" style={{ color: "var(--text-secondary)" }}>
        {kb?.name ?? "知识库"}
      </p>

      {/* Stats row */}
      <div className="flex justify-center gap-4 mb-6">
        {[
          { value: kbStats.doc_count, label: "文档" },
          { value: kbStats.chunk_count, label: "分块" },
          { value: kbStats.session_count, label: "会话" },
          { value: kbStats.message_count, label: "消息" },
        ].map((s) => (
          <div key={s.label} className="text-center">
            <p
              className="display-text text-lg font-semibold tabular-nums"
              style={{ color: "var(--text-primary)" }}
            >
              {s.value}
            </p>
            <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
              {s.label}
            </p>
          </div>
        ))}
      </div>

      {/* Suggested questions */}
      {docs.length > 0 && (
        <div className="max-w-md mx-auto">
          <p
            className="text-[10px] font-medium uppercase tracking-wider mb-2"
            style={{ color: "var(--text-muted)" }}
          >
            建议问题
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {[
              `请总结「${docs[0].filename}」的核心内容`,
              docs.length > 1 ? `对比「${docs[0].filename}」和「${docs[1].filename}」` : null,
              "文档中有哪些关键数据？请用表格列出",
              "根据文档内容，有哪些需要注意的事项？",
            ]
              .filter(Boolean)
              .map((q) => (
                <button
                  key={q}
                  type="button"
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-all suggest-btn"
                  style={{
                    backgroundColor: "var(--surface-bg)",
                    color: "var(--text-secondary)",
                    border: "var(--border-light)",
                  }}
                  onClick={() => handleQuestionClick(q as string)}
                >
                  {q}
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
