import { useMemo, useState } from "react";
import { deleteDocument } from "../../api/kb";
import { toast } from "../../stores/toastStore";
import type { Document } from "../../types";

type DocSort =
  | "name-asc"
  | "name-desc"
  | "date-newest"
  | "date-oldest"
  | "chunks-most"
  | "chunks-least";

interface DocManageModalProps {
  docs: Document[];
  kbId: number;
  onClose: () => void;
  onDocClick: (doc: Document) => void;
  onSaved: () => void;
}

export default function DocManageModal({
  docs,
  kbId,
  onClose,
  onDocClick,
  onSaved,
}: DocManageModalProps) {
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<DocSort>("date-newest");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Only show ready docs
  const readyDocs = useMemo(() => docs.filter((d) => d.status === "ready"), [docs]);

  const filtered = useMemo(() => {
    const list = filter.trim()
      ? readyDocs.filter((d) => d.filename.toLowerCase().includes(filter.trim().toLowerCase()))
      : [...readyDocs];
    switch (sort) {
      case "name-asc":
        list.sort((a, b) => a.filename.localeCompare(b.filename));
        break;
      case "name-desc":
        list.sort((a, b) => b.filename.localeCompare(a.filename));
        break;
      case "date-newest":
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "date-oldest":
        list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        break;
      case "chunks-most":
        list.sort((a, b) => b.chunk_count - a.chunk_count);
        break;
      case "chunks-least":
        list.sort((a, b) => a.chunk_count - b.chunk_count);
        break;
    }
    return list;
  }, [readyDocs, filter, sort]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((d) => d.id)));
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleBatchDelete = async () => {
    for (const id of selectedIds) {
      try {
        await deleteDocument(kbId, id);
      } catch {
        /* continue */
      }
    }
    setSelectedIds(new Set());
    onSaved();
    toast(`已删除 ${selectedIds.size} 篇文档`, "success");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in"
      style={{ backgroundColor: "var(--overlay-heavy)", backdropFilter: "blur(3px)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: "var(--border-light)" }}
        >
          <div className="flex items-center gap-3">
            <h3 className="display-text text-base" style={{ color: "var(--text-primary)" }}>
              文档管理
            </h3>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {readyDocs.length} 篇
            </span>
          </div>
          <button
            type="button"
            className="text-xl leading-none p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Toolbar */}
        <div
          className="flex items-center gap-2 px-6 py-2.5 shrink-0"
          style={{ borderBottom: "var(--border-light)", backgroundColor: "var(--surface-bg)" }}
        >
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="搜索文档…"
            className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface-card)",
              border: "var(--border-light)",
              color: "var(--text-primary)",
            }}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as DocSort)}
            className="px-2 py-1.5 rounded-md text-xs outline-none"
            style={{
              backgroundColor: "var(--surface-card)",
              border: "var(--border-light)",
              color: "var(--text-secondary)",
            }}
          >
            <option value="date-newest">时间 ↓</option>
            <option value="date-oldest">时间 ↑</option>
            <option value="name-asc">名称 A-Z</option>
            <option value="name-desc">名称 Z-A</option>
            <option value="chunks-most">分块 ↓</option>
            <option value="chunks-least">分块 ↑</option>
          </select>
          <label
            className="flex items-center gap-1 text-xs cursor-pointer shrink-0"
            style={{ color: "var(--text-muted)" }}
          >
            <input
              type="checkbox"
              className="w-3 h-3"
              checked={selectedIds.size === filtered.length && filtered.length > 0}
              onChange={toggleSelectAll}
            />
            全选
          </label>
          {selectedIds.size > 0 && (
            <button
              type="button"
              className="text-xs font-medium px-2 py-1 rounded transition-colors shrink-0"
              style={{ color: "var(--danger)" }}
              onClick={handleBatchDelete}
            >
              删除({selectedIds.size})
            </button>
          )}
        </div>

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto px-6 py-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: "var(--text-muted)" }}>
              {readyDocs.length === 0 ? "暂无文档" : "无匹配文档"}
            </p>
          ) : (
            filtered.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between py-2.5 text-sm group"
                style={{ borderBottom: "var(--border-light)" }}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 shrink-0"
                    checked={selectedIds.has(d.id)}
                    onChange={() => toggleOne(d.id)}
                  />
                  <button
                    type="button"
                    className="text-left truncate hover:underline"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => onDocClick(d)}
                  >
                    {d.filename}
                  </button>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-3">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {d.chunk_count} 块
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    {new Date(d.created_at).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
