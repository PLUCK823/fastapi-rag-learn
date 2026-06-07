import React, { useMemo, useState } from "react";

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
  onRemove: (taskId: string) => void;
  onStop: (taskId: string) => void;
}

type SortKey = "name-asc" | "name-desc" | "status" | "progress" | "time";

function UploadProgressModal({
  items,
  onClose,
  onRemove,
  onStop,
}: UploadProgressModalProps) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("status");

  const filtered = useMemo(() => {
    const list = filter.trim()
      ? items.filter((q) => q.filename.toLowerCase().includes(filter.trim().toLowerCase()))
      : [...items];

    switch (sort) {
      case "name-asc":
        list.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case "name-desc":
        list.sort((a, b) => b.filename.localeCompare(a.filename));
        break;
      case "time":
        // Newest first (by insertion order — reversed items array)
        list.reverse();
        break;
      case "status":
        list.sort((a, b) => {
          const order: Record<string, number> = { uploading: 0, error: 1, done: 2 };
          return (order[a.status] ?? 0) - (order[b.status] ?? 0);
        });
        break;
      case "progress":
        list.sort((a, b) => b.progress - a.progress);
        break;
    }
    return list;
  }, [items, filter, sort]);

  const done = items.filter((q) => q.status === "done").length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ backgroundColor: "var(--overlay-heavy)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-lg max-h-[70vh] flex flex-col overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-5 py-2 shrink-0"
          style={{ borderBottom: "var(--border-light)", backgroundColor: "var(--surface-bg)" }}
        >
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索文件名…"
            className="flex-1 px-2.5 py-1.5 rounded-md text-xs outline-none"
            style={{
              backgroundColor: "var(--surface-card)",
              border: "var(--border-light)",
              color: "var(--text-primary)",
            }}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="px-2 py-1.5 rounded-md text-xs outline-none"
            style={{
              backgroundColor: "var(--surface-card)",
              border: "var(--border-light)",
              color: "var(--text-secondary)",
            }}
          >
            <option value="time">按时间</option>
            <option value="status">按状态</option>
            <option value="progress">按进度</option>
            <option value="name-asc">名称 A-Z</option>
            <option value="name-desc">名称 Z-A</option>
          </select>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5">
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-8" style={{ color: "var(--text-muted)" }}>
              无匹配记录
            </p>
          ) : (
            filtered.map((item, i) => (
              <div key={item.taskId || i} className="flex flex-col gap-1 py-1">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className="shrink-0 w-5 text-center"
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
                  {item.status === "uploading" && (
                    <button
                      type="button"
                      className="text-xs px-2 py-0.5 rounded transition-colors shrink-0"
                      style={{ color: "var(--danger)", border: "1px solid var(--danger-border)" }}
                      onClick={() => onStop(item.taskId)}
                    >
                      终止
                    </button>
                  )}
                  {(item.status === "done" || item.status === "error") && (
                    <button
                      type="button"
                      className="text-xs px-2 py-0.5 rounded transition-colors shrink-0"
                      style={{
                        color: "var(--text-muted)",
                        border: "1px solid var(--border-medium)",
                      }}
                      onClick={() => onRemove(item.taskId)}
                    >
                      删除
                    </button>
                  )}
                </div>
                {item.status === "uploading" && (
                  <div
                    className="h-1.5 rounded-full overflow-hidden ml-7"
                    style={{ backgroundColor: "var(--border-light)" }}
                  >
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// Only re-render when items array reference changes (ignore callback props)
export default React.memo(UploadProgressModal, (prev, next) => prev.items === next.items);
