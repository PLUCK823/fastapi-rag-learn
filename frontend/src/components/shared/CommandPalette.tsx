import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

interface Command {
  id: string;
  label: string;
  /** 快捷键显示 */
  shortcut?: string;
  /** 所属分组 */
  group: string;
  action: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 额外的上下文命令（如导出对话、当前页面相关） */
  extraCommands?: Command[];
}

const SEARCH_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const ENTER_ICON = (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <polyline points="9 10 4 15 9 20" />
    <path d="M20 4v7a4 4 0 0 1-4 4H4" />
  </svg>
);

export default function CommandPalette({ open, onClose, extraCommands = [] }: Props) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const baseCommands: Command[] = useMemo(
    () => [
      {
        id: "kb-list",
        label: "知识库列表",
        shortcut: "G K",
        group: "导航",
        action: () => navigate("/"),
      },
      {
        id: "theme",
        label: "切换深色/亮色模式",
        shortcut: "⇧ D",
        group: "外观",
        action: () => {
          const btn = document.querySelector<HTMLButtonElement>('[aria-label*="切换"]');
          btn?.click();
        },
      },
    ],
    [navigate],
  );

  const allCommands = useMemo(
    () => [...baseCommands, ...extraCommands],
    [baseCommands, extraCommands],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allCommands;
    return allCommands.filter(
      (c) => c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q),
    );
  }, [query, allCommands]);

  // Reset state when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const execute = useCallback(
    (cmd: Command) => {
      cmd.action();
      onClose();
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) execute(filtered[selectedIndex]);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [filtered, selectedIndex, execute, onClose],
  );

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 animate-fade-in"
      style={{ backgroundColor: "var(--overlay)", backdropFilter: "blur(2px)" }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-md overflow-hidden animate-fade-in-up"
        style={{ animationDuration: "150ms" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "var(--border-light)" }}
        >
          <span style={{ color: "var(--text-muted)" }}>{SEARCH_ICON}</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入命令搜索…"
            className="flex-1 outline-none text-sm bg-transparent"
            style={{ color: "var(--text-primary)" }}
          />
          <kbd
            className="text-[10px] px-1.5 py-0.5 rounded font-mono"
            style={{
              backgroundColor: "var(--surface-bg)",
              color: "var(--text-muted)",
              border: "var(--border-light)",
            }}
          >
            esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-64 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
              无匹配命令
            </p>
          ) : (
            filtered.map((cmd, i) => (
              <button
                key={cmd.id}
                type="button"
                className="w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors text-sm"
                style={{
                  backgroundColor: i === selectedIndex ? "var(--surface-bg)" : "transparent",
                  color: "var(--text-primary)",
                }}
                onClick={() => execute(cmd)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span>{cmd.label}</span>
                <span
                  className="text-[10px] shrink-0 flex items-center gap-1 font-mono"
                  style={{ color: "var(--text-muted)" }}
                >
                  {cmd.shortcut}
                  {i === selectedIndex && ENTER_ICON}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div
          className="px-4 py-2 flex items-center gap-3 text-[10px]"
          style={{ color: "var(--text-muted)", borderTop: "var(--border-light)" }}
        >
          <span>↑↓ 导航</span>
          <span>↵ 选择</span>
          <span>esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
