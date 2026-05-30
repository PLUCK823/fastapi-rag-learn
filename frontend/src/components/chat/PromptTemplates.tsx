import { useState } from "react";

const TEMPLATES = [
  { icon: "📝", label: "总结文档", prompt: "请总结文档的核心内容和关键观点。" },
  { icon: "📊", label: "提取关键数据", prompt: "请从文档中提取所有关键数据和数值信息，用表格列出。" },
  { icon: "🔄", label: "对比分析", prompt: "请对比分析文档中提到的不同方案或数据，列出各自的优缺点。" },
  { icon: "📋", label: "列出要点", prompt: "请用列表形式列出文档中的所有要点。" },
  { icon: "🔍", label: "深度分析", prompt: "请对文档内容进行深度分析，包括背景、逻辑、影响和潜在问题。" },
];

interface PromptTemplatesProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export default function PromptTemplates({ onSelect, disabled }: PromptTemplatesProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      {!visible ? (
        <button
          type="button"
          className="text-[11px] font-medium px-2 py-1 rounded-md transition-colors shrink-0"
          style={{
            color: "var(--text-muted)",
            backgroundColor: "var(--surface-bg)",
            border: "var(--border-light)",
          }}
          onClick={() => setVisible(true)}
          disabled={disabled}
          title="提示词模板"
        >
          💡 模板
        </button>
      ) : (
        <div className="flex gap-1.5 flex-wrap">
          <button
            type="button"
            className="text-[11px] px-1.5 py-0.5 rounded-md transition-colors shrink-0"
            style={{
              color: "var(--text-muted)",
              backgroundColor: "transparent",
              border: "var(--border-light)",
            }}
            onClick={() => setVisible(false)}
          >
            收起
          </button>
          {TEMPLATES.map((t) => (
            <button
              key={t.label}
              type="button"
              className="text-[11px] px-2 py-1 rounded-md transition-all shrink-0"
              style={{
                color: "var(--text-secondary)",
                backgroundColor: "var(--surface-bg)",
                border: "var(--border-light)",
              }}
              onClick={() => {
                onSelect(t.prompt);
                setVisible(false);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--color-copper)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-color-light)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
              title={t.prompt}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
