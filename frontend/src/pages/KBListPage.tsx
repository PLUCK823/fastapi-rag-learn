import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { createKB, deleteKB, listKBs, renameKB } from "../api/kb";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import { toast } from "../stores/toastStore";
import type { KBDetail, KnowledgeBase } from "../types";
import { getErrorMessage } from "../utils/error";

/* ── Hoisted static empty state ── */
const EMPTY_STATE = (
  <div className="text-center py-20 animate-fade-in-up">
    <div
      className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
      style={{ backgroundColor: "var(--surface-bg)" }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.3"
        role="img"
        aria-label="空知识库"
      >
        <title>空知识库</title>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    </div>
    <p className="display-text text-base mb-2" style={{ color: "var(--text-secondary)" }}>
      暂无知识库
    </p>
    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
      创建一个开始吧
    </p>
  </div>
);

export default function KBListPage() {
  const [kbs, setKBs] = useState<(KnowledgeBase | KBDetail)[]>([]);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<(KnowledgeBase | KBDetail) | null>(null);
  const [editingKb, setEditingKb] = useState<(KnowledgeBase | KBDetail) | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingKb && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingKb]);

  const refresh = useCallback(() => {
    listKBs(true).then(setKBs).catch((err) => {
      toast(getErrorMessage(err));
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    const name = newName.trim();
    if (!name) {
      toast("请输入知识库名称", "info");
      return;
    }
    try {
      await createKB(name);
      setNewName("");
      refresh();
      toast("知识库创建成功", "success");
    } catch (err) {
      toast(getErrorMessage(err));
    }
  }, [newName, refresh]);

  const handleDelete = useCallback((kb: KnowledgeBase | KBDetail) => {
    setConfirmDelete(kb);
  }, []);

  const handleEdit = useCallback((kb: KnowledgeBase | KBDetail) => {
    setEditingKb(kb);
    setEditingName(kb.name);
  }, []);

  const executeRename = useCallback(async () => {
    const name = editingName.trim();
    if (!editingKb || !name) return;
    try {
      await renameKB(editingKb.id, name);
      setEditingKb(null);
      setEditingName("");
      refresh();
      toast("知识库已重命名", "success");
    } catch (err) {
      toast(getErrorMessage(err));
    }
  }, [editingKb, editingName, refresh]);

  const executeDelete = useCallback(async () => {
    if (!confirmDelete) return;
    try {
      await deleteKB(confirmDelete.id);
      setConfirmDelete(null);
      refresh();
      toast("知识库已删除", "success");
    } catch (err) {
      toast(getErrorMessage(err));
      setConfirmDelete(null);
    }
  }, [confirmDelete, refresh]);

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-baseline justify-between mb-8 animate-fade-in-up">
        <div>
          <h1 className="display-text text-2xl mb-1" style={{ color: "var(--text-primary)" }}>
            我的知识库
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {kbs.length === 0 ? "创建知识库，导入文档开始 RAG 问答" : `${kbs.length} 个知识库`}
          </p>
        </div>
      </div>

      {/* Create bar */}
      <div className="flex gap-3 mb-8 animate-fade-in-up" style={{ animationDelay: "50ms" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleCreate();
          }}
          placeholder="输入知识库名称…"
          className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
          style={{
            backgroundColor: "var(--surface-card)",
            border: "var(--border-medium)",
            color: "var(--text-primary)",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "var(--color-copper)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(28,28,46,0.1)";
          }}
        />
        <button
          type="button"
          className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-cream)",
          }}
          onClick={handleCreate}
        >
          创建
        </button>
      </div>

      {/* KB List */}
      {kbs.length === 0 ? (
        EMPTY_STATE
      ) : (
        <div className="space-y-3">
          {kbs.map((kb, i) => (
            <div
              key={kb.id}
              className="card card-hover px-5 py-4 flex items-center justify-between animate-fade-in-up"
              style={{ animationDelay: `${100 + i * 60}ms` }}
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                {/* Icon */}
                <div
                  className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                  style={{ backgroundColor: "var(--surface-bg)" }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--color-copper)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    role="img"
                    aria-label="知识库"
                  >
                    <title>知识库</title>
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </div>
                {editingKb?.id === kb.id ? (
                  <input
                    ref={editInputRef}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") executeRename();
                      if (e.key === "Escape") {
                        setEditingKb(null);
                        setEditingName("");
                      }
                    }}
                    onBlur={() => {
                      if (editingName.trim() && editingName.trim() !== editingKb?.name) {
                        executeRename();
                      } else {
                        setEditingKb(null);
                        setEditingName("");
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-lg text-sm outline-none"
                    style={{
                      backgroundColor: "var(--surface-bg)",
                      border: "1px solid var(--color-copper)",
                      color: "var(--text-primary)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/chat/${kb.id}`}
                      className="font-medium text-sm no-underline transition-colors block truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {kb.name}
                    </Link>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {kb.document_count} 篇文档
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <button
                  type="button"
                  className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--surface-bg)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                  onClick={() => handleEdit(kb)}
                >
                  编辑
                </button>
                <button
                  type="button"
                  className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  style={{ color: "var(--text-muted)" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "rgba(181, 91, 91, 0.08)";
                    e.currentTarget.style.color = "var(--danger)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                  onClick={() => handleDelete(kb)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Delete Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title="确认删除"
          message={`确定删除「${confirmDelete.name}」及其所有文档？此操作不可撤销。`}
          confirmLabel="确认删除"
          danger
          onConfirm={executeDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
