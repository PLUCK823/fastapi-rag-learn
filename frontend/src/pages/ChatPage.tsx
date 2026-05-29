import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";
import {
  clearMessages,
  deleteDocument,
  deleteSession,
  getDocContent,
  listKBs,
  listSessions,
  renameDocument,
  uploadFile,
} from "../api/kb";
import ChatMessage from "../components/chat/ChatMessage";
import DocEditorModal from "../components/chat/DocEditorModal";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import { useChatWS } from "../hooks/useChat";
import type { Document, KBDetail, Session } from "../types";

const SEND_ICON = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    role="img"
    aria-label="发送"
  >
    <title>发送</title>
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const EMPTY_CHAT = (
  <div className="text-center py-16 animate-fade-in-up">
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
    <p className="display-text text-sm mb-1" style={{ color: "var(--text-secondary)" }}>
      开始对话
    </p>
    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
      输入问题，AI 将从你的文档中检索答案
    </p>
  </div>
);

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

export default function ChatPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const kbIdNum = Number(kbId);
  const [kb, setKb] = useState<KBDetail | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [input, setInput] = useState("");

  // Session state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const { messages, isStreaming, send, clear, prepareSend } = useChatWS(kbIdNum, activeSessionId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editContent, setEditContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Document | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<Session | null>(null);

  // Document rename state
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [editingDocName, setEditingDocName] = useState("");
  const docEditInputRef = useRef<HTMLInputElement>(null);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingDocId && docEditInputRef.current) {
      docEditInputRef.current.focus();
    }
  }, [editingDocId]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshDocs = useCallback(async () => {
    const kbs = (await listKBs(true)) as KBDetail[];
    const current = kbs.find((k) => k.id === kbIdNum);
    if (current) {
      setKb(current);
      setDocs(current.documents ?? []);
    }
  }, [kbIdNum]);

  const refreshSessions = useCallback(async () => {
    const list = await listSessions(kbIdNum);
    setSessions(list);
    return list;
  }, [kbIdNum]);

  // Init: load docs + sessions, auto-select or create session
  useEffect(() => {
    refreshDocs();
    refreshSessions().then((list) => {
      // Auto-select the latest session, or create empty session if no sessions
      if (list.length > 0) {
        setActiveSessionId(list[0].session_id);
      } else {
        // No sessions exist, create an empty one for immediate use
        const sid = `sess_${Date.now()}`;
        setActiveSessionId(sid);
        setSessions([
          {
            session_id: sid,
            first_question: "新的对话",
            message_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
      }
    });
  }, [refreshDocs, refreshSessions]);

  /* ── Session actions ── */

  const handleNewSession = useCallback(() => {
    // If current session has no messages, don't create a new one
    // Just stay on the current empty session
    if (messages.length === 0 && activeSessionId) {
      return;
    }

    // Generate a timestamp-based session ID
    const sid = `sess_${Date.now()}`;
    setActiveSessionId(sid);
    setSessions((prev) => [
      {
        session_id: sid,
        first_question: "新的对话",
        message_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...prev,
    ]);
  }, [messages.length, activeSessionId]);

  const handleDeleteSession = useCallback((s: Session) => {
    setConfirmDeleteSession(s);
  }, []);

  const executeDeleteSession = useCallback(async () => {
    if (!confirmDeleteSession) return;
    const sid = confirmDeleteSession.session_id;
    await deleteSession(kbIdNum, sid);
    setConfirmDeleteSession(null);
    const list = await refreshSessions();
    // If deleted current session, switch to latest
    if (activeSessionId === sid) {
      setActiveSessionId(list.length > 0 ? list[0].session_id : null);
    }
  }, [kbIdNum, confirmDeleteSession, activeSessionId, refreshSessions]);

  /* ── Document actions ── */

  const openNew = useCallback(() => {
    setEditDoc(null);
    setEditContent("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback(
    async (doc: Document) => {
      setEditDoc(doc);
      const { content } = await getDocContent(kbIdNum, doc.id);
      setEditContent(content);
      setModalOpen(true);
    },
    [kbIdNum],
  );

  const handleDeleteDoc = useCallback((doc: Document) => {
    setConfirmDelete(doc);
  }, []);

  const executeDeleteDoc = useCallback(async () => {
    if (!confirmDelete) return;
    await deleteDocument(kbIdNum, confirmDelete.id);
    setConfirmDelete(null);
    refreshDocs();
  }, [kbIdNum, confirmDelete, refreshDocs]);

  const handleEditDocName = useCallback((doc: Document) => {
    setEditingDocId(doc.id);
    setEditingDocName(doc.filename);
  }, []);

  const executeRenameDoc = useCallback(async () => {
    const name = editingDocName.trim();
    if (!editingDocId || !name) return;
    await renameDocument(kbIdNum, editingDocId, name);
    setEditingDocId(null);
    setEditingDocName("");
    refreshDocs();
  }, [kbIdNum, editingDocId, editingDocName, refreshDocs]);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setUploading(true);
      try {
        await uploadFile(kbIdNum, file);
        refreshDocs();
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [kbIdNum, refreshDocs],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (isStreaming || !text) return;

    // Prepare send FIRST - prevent message reload when session changes
    prepareSend();

    // Auto-create session if none exists
    let sid = activeSessionId;
    if (!sid) {
      const newSid = `sess_${Date.now()}`;
      sid = newSid;
      // Use flushSync to ensure state updates synchronously
      // This guarantees that prepareSend() flag is set BEFORE the useEffect runs
      flushSync(() => {
        setActiveSessionId(newSid);
        setSessions((prev) => [
          {
            session_id: newSid,
            first_question: "新的对话",
            message_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      });
    }

    // Use the sid (either existing or newly created)
    send(text, sid);
    setInput("");
    // Refresh sessions after send (to update the list when backend saves)
    setTimeout(() => refreshSessions(), 500);
  }, [input, isStreaming, send, refreshSessions, activeSessionId, prepareSend]);

  const displayName = activeSessionId
    ? (sessions.find((s) => s.session_id === activeSessionId)?.first_question ?? "对话")
    : "对话";

  return (
    <div className="flex gap-6 max-w-6xl mx-auto" style={{ height: "calc(100vh - 120px)" }}>
      {/* Left sidebar: documents + sessions */}
      <aside className="w-56 shrink-0 card p-4 flex flex-col overflow-hidden">
        {/* KB name */}
        <h2
          className="display-text text-sm font-semibold truncate mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          {kb?.name ?? "..."}
        </h2>

        {/* Upload & New buttons */}
        <div className="flex gap-1.5 mb-3">
          <button
            type="button"
            className="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors"
            style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
            onClick={openNew}
          >
            + 新建
          </button>
          <button
            type="button"
            className="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--surface-bg)",
              color: "var(--text-secondary)",
              border: "var(--border-medium)",
            }}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "上传中..." : "上传"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>

        {/* Sessions section */}
        <div className="pb-2 mb-2" style={{ borderBottom: "var(--border-light)" }}>
          <div className="flex items-center justify-between mb-1">
            <span
              className="text-[10px] font-medium uppercase tracking-wider"
              style={{ color: "var(--text-muted)" }}
            >
              会话
            </span>
            <button
              type="button"
              className="text-xs font-medium px-1.5 py-0.5 rounded transition-colors"
              style={{ color: "var(--accent)" }}
              onClick={handleNewSession}
            >
              + 新建
            </button>
          </div>
          <div className="-mx-4 px-4 max-h-28 overflow-y-auto">
            {sessions.length === 0 ? (
              <p className="text-[10px] py-1" style={{ color: "var(--text-muted)" }}>
                暂无历史会话
              </p>
            ) : (
              sessions.map((s) => {
                const isActive = s.session_id === activeSessionId;
                return (
                  <div
                    key={s.session_id}
                    className="flex items-center justify-between py-1 text-xs group"
                  >
                    <button
                      type="button"
                      className={`text-left truncate flex-1 mr-1 py-0.5 rounded px-1 transition-colors ${
                        isActive ? "font-medium" : ""
                      }`}
                      style={{
                        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                        backgroundColor: isActive ? "var(--surface-bg)" : "transparent",
                      }}
                      onClick={() => setActiveSessionId(s.session_id)}
                    >
                      <span className="block truncate text-[11px]">
                        {s.first_question || "新的对话"}
                      </span>
                      <span className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                        {fmtDate(s.updated_at)} · {s.message_count} 条
                      </span>
                    </button>
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 px-1 py-0.5 rounded text-[10px]"
                      style={{ color: "var(--text-muted)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(s);
                      }}
                    >
                      删
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Doc list */}
        <div className="flex-1 overflow-y-auto -mx-4 px-4">
          {docs.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: "var(--text-muted)" }}>
              暂无文档
            </p>
          ) : (
            docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between py-2 text-xs group"
                style={{ borderBottom: "var(--border-light)" }}
              >
                {editingDocId === d.id ? (
                  <input
                    ref={docEditInputRef}
                    value={editingDocName}
                    onChange={(e) => setEditingDocName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") executeRenameDoc();
                      if (e.key === "Escape") {
                        setEditingDocId(null);
                        setEditingDocName("");
                      }
                    }}
                    onBlur={() => {
                      if (editingDocName.trim() && editingDocName.trim() !== d.filename) {
                        executeRenameDoc();
                      } else {
                        setEditingDocId(null);
                        setEditingDocName("");
                      }
                    }}
                    className="flex-1 px-2 py-1 rounded text-xs outline-none mr-2"
                    style={{
                      backgroundColor: "var(--surface-bg)",
                      border: "1px solid var(--color-copper)",
                      color: "var(--text-primary)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-left truncate flex-1 mr-2 py-0.5 transition-colors"
                    style={{ color: "var(--text-secondary)" }}
                    onClick={() => openEdit(d)}
                  >
                    {d.filename}
                  </button>
                )}
                <div className="flex items-center gap-1 shrink-0">
                  {editingDocId !== d.id && (
                    <button
                      type="button"
                      className="opacity-0 group-hover:opacity-100 transition-opacity px-1 py-0.5 rounded text-xs"
                      style={{ color: "var(--text-muted)" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditDocName(d);
                      }}
                    >
                      改
                    </button>
                  )}
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 px-1 py-0.5 rounded text-xs"
                    style={{ color: "var(--text-muted)" }}
                    onClick={() => handleDeleteDoc(d)}
                  >
                    删
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chat area */}
      <div className="flex-1 flex flex-col card p-0 overflow-hidden">
        {/* Chat header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "var(--border-light)" }}
        >
          <div className="flex items-center gap-2">
            <h2
              className="display-text text-sm font-semibold truncate max-w-[300px]"
              style={{ color: "var(--text-primary)" }}
            >
              {displayName}
            </h2>
            {isStreaming && (
              <span className="text-xs animate-pulse-soft" style={{ color: "var(--accent)" }}>
                回答中...
              </span>
            )}
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              className="text-xs font-medium transition-colors px-2 py-1 rounded-md"
              style={{ color: "var(--text-muted)" }}
              onClick={async () => {
                await clearMessages(kbIdNum);
                clear();
              }}
            >
              清空聊天
            </button>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0
            ? EMPTY_CHAT
            : messages.map((m) => <ChatMessage key={m.id} msg={m} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="flex gap-3 px-5 py-4 shrink-0" style={{ borderTop: "var(--border-light)" }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="输入问题，Enter 发送…"
            className="flex-1 px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface-bg)",
              border: "var(--border-medium)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => {
              e.target.style.borderColor = "var(--color-copper)";
            }}
            onBlur={(e) => {
              e.target.style.borderColor = "rgba(28,28,46,0.1)";
            }}
            disabled={isStreaming}
          />
          <button
            type="button"
            className="px-4 py-2.5 rounded-lg transition-all duration-200 disabled:opacity-40 flex items-center gap-1.5"
            style={{
              backgroundColor: "var(--color-ink)",
              color: "var(--color-cream)",
            }}
            disabled={isStreaming || !input.trim()}
            onClick={handleSend}
          >
            {isStreaming ? (
              <span className="text-xs">...</span>
            ) : (
              <>
                <span className="text-sm font-medium">发送</span>
                {SEND_ICON}
              </>
            )}
          </button>
        </div>
      </div>

      {/* DocEditor Modal */}
      {modalOpen && (
        <DocEditorModal
          kbId={kbIdNum}
          editDoc={editDoc}
          initialContent={editContent}
          onClose={() => setModalOpen(false)}
          onSaved={refreshDocs}
        />
      )}

      {/* Confirm Delete Doc Dialog */}
      {confirmDelete && (
        <ConfirmDialog
          title="确认删除"
          message={`确定删除「${confirmDelete.filename}」？此操作不可撤销。`}
          confirmLabel="确认删除"
          danger
          onConfirm={executeDeleteDoc}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Confirm Delete Session Dialog */}
      {confirmDeleteSession && (
        <ConfirmDialog
          title="确认删除"
          message={`确定删除会话「${confirmDeleteSession.first_question || "新的对话"}」？会话中的所有消息将被清除。`}
          confirmLabel="确认删除"
          danger
          onConfirm={executeDeleteSession}
          onCancel={() => setConfirmDeleteSession(null)}
        />
      )}
    </div>
  );
}
