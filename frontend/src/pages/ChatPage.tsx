import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { clearMessages, deleteDocument, getDocContent, listKBs, uploadFile } from "../api/kb";
import ChatMessage from "../components/chat/ChatMessage";
import DocEditorModal from "../components/chat/DocEditorModal";
import { useChatWS } from "../hooks/useChat";
import type { Document, KBDetail } from "../types";

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

export default function ChatPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const kbIdNum = Number(kbId);
  const [kb, setKb] = useState<KBDetail | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [input, setInput] = useState("");
  const { messages, isStreaming, send, clear } = useChatWS(kbIdNum);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editContent, setEditContent] = useState("");

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

  useEffect(() => {
    refreshDocs();
  }, [refreshDocs]);

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

  const handleDeleteDoc = useCallback(
    async (doc: Document) => {
      if (!confirm(`确定删除「${doc.filename}」？`)) return;
      await deleteDocument(kbIdNum, doc.id);
      refreshDocs();
    },
    [kbIdNum, refreshDocs],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      await uploadFile(kbIdNum, file);
      refreshDocs();
      // Reset so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [kbIdNum, refreshDocs],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (isStreaming || !text) return;
    send(text);
    setInput("");
  }, [input, isStreaming, send]);

  return (
    <div className="flex gap-6 max-w-6xl mx-auto" style={{ height: "calc(100vh - 120px)" }}>
      {/* Document sidebar */}
      <aside className="w-56 shrink-0 card p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h2
            className="display-text text-sm font-semibold truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {kb?.name ?? "..."}
          </h2>
        </div>

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
            className="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors"
            style={{
              backgroundColor: "var(--surface-bg)",
              color: "var(--text-secondary)",
              border: "var(--border-medium)",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            上传
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
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
                <button
                  type="button"
                  className="text-left truncate flex-1 mr-2 py-0.5 transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => openEdit(d)}
                >
                  {d.filename}
                </button>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 px-1 py-0.5 rounded text-xs"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => handleDeleteDoc(d)}
                >
                  删
                </button>
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
              className="display-text text-sm font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              对话
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
    </div>
  );
}
