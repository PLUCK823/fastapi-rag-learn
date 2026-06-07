import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useParams } from "react-router-dom";
import {
  clearMessages,
  deleteSession,
  getDocContent,
  getKB,
  listSessions,
  pollTask,
  searchMessages,
  uploadFileAsync,
} from "../api/kb";
import ChatMessage from "../components/chat/ChatMessage";
import ChatSidebar from "../components/chat/ChatSidebar";
import DashboardView from "../components/chat/DashboardView";
import DocEditorModal from "../components/chat/DocEditorModal";
import DocManageModal from "../components/chat/DocManageModal";
import DocViewerModal from "../components/chat/DocViewerModal";
import PromptTemplates from "../components/chat/PromptTemplates";
import UploadProgressModal from "../components/chat/UploadProgressModal";
import ConfirmDialog from "../components/shared/ConfirmDialog";
import { ChatSkeleton } from "../components/shared/Skeleton";
import { useChatWS } from "../hooks/useChat";
import { toast } from "../stores/toastStore";
import type { Document, KBDetail, SearchResult, Session } from "../types";
import { getErrorMessage } from "../utils/error";

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

/** Generate markdown from messages and trigger download */
function exportConversation(messages: { role: string; content: string }[], title: string) {
  const lines: string[] = [
    `# ${title}`,
    `> 导出时间: ${new Date().toLocaleString("zh-CN")}`,
    "",
    "---",
    "",
  ];
  for (const m of messages) {
    const role = m.role === "user" ? "**👤 用户**" : "**🤖 助手**";
    lines.push(`${role}`);
    lines.push("");
    lines.push(m.content);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `对话导出_${new Date().toISOString().slice(0, 10)}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function ChatPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const kbIdNum = Number(kbId);
  const [kb, setKb] = useState<KBDetail | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [input, setInput] = useState("");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const {
    messages,
    isStreaming,
    messagesLoading,
    send,
    resend,
    clear,
    truncateAt,
    prepareSend,
    resetLoadFlag,
  } = useChatWS(kbIdNum, activeSessionId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [editContent, setEditContent] = useState("");
  const UPLOAD_QUEUE_KEY = `upload_queue_${kbIdNum}`;

  const [uploadQueue, setUploadQueue] = useState<
    { filename: string; taskId: string; status: string; progress: number; error?: string }[]
  >(() => {
    try {
      const raw = localStorage.getItem(UPLOAD_QUEUE_KEY);
      return raw ? (JSON.parse(raw) as typeof uploadQueue) : [];
    } catch {
      return [];
    }
  });
  const [, setDocsLoading] = useState(true);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState<Session | null>(null);
  const [confirmClearChat, setConfirmClearChat] = useState(false);

  const [showDocManage, setShowDocManage] = useState(false);
  const [showUploadProgress, setShowUploadProgress] = useState(false);

  const [viewerDoc, setViewerDoc] = useState<{
    filename: string;
    content: string;
    questionKeywords: string[];
    highlightKeywords: string[];
  } | null>(null);

  // Search state
  const [sessionSearchQ, setSessionSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  const extractKeywords = useCallback((text: string): string[] => {
    const cleaned = text.replace(/[？?，,。！!、：:；;（）()【】[\]]/g, " ");
    const spaceWords = cleaned.split(/\s+/).filter((w) => w.length >= 2);
    const chineseOnly = text.replace(/[^一-鿿]/g, "");
    const ngrams: string[] = [];
    for (let len = 4; len >= 2; len--) {
      for (let i = 0; i <= chineseOnly.length - len; i++) {
        ngrams.push(chineseOnly.slice(i, i + len));
      }
    }
    const all = [...spaceWords, ...ngrams];
    const seen = new Set<string>();
    return all.filter((w) => {
      const lower = w.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });
  }, []);

  const readyDocs = useMemo(() => docs.filter((d) => d.status === "ready"), [docs]);

  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Upload queue persistence
  useEffect(() => {
    localStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(uploadQueue));
  }, [uploadQueue, UPLOAD_QUEUE_KEY]);

  // Resume in-progress upload polling after page refresh
  useEffect(() => {
    for (const item of uploadQueue) {
      if (item.status !== "uploading" || !item.taskId) continue;
      if (pollIntervalsRef.current.has(item.taskId)) continue;
      const filename = item.filename;
      const startTime = Date.now();
      const MAX_POLL_MS = 720_000;
      const poll = setInterval(async () => {
        try {
          const t = await pollTask(item.taskId);
          const elapsed = Date.now() - startTime;
          const newStatus =
            t.status === "failed"
              ? "error"
              : t.status === "done"
                ? "done"
                : elapsed > MAX_POLL_MS
                  ? "error"
                  : "uploading";
          const newError =
            t.status === "failed"
              ? t.message
              : elapsed > MAX_POLL_MS
                ? "处理超时，请重试"
                : undefined;

          setUploadQueue((prev) => {
            const existing = prev.find((q) => q.taskId === item.taskId);
            if (
              existing &&
              existing.status === newStatus &&
              existing.progress === t.progress
            ) {
              return prev;
            }
            return prev.map((q) =>
              q.taskId === item.taskId
                ? { ...q, status: newStatus, progress: t.progress, error: newError }
                : q,
            );
          });
          if (t.status === "done") {
            clearInterval(poll);
            pollIntervalsRef.current.delete(item.taskId);
            toast(`${filename} 上传完成`, "success");
            refreshDocs();
          } else if (t.status === "failed" || elapsed > MAX_POLL_MS) {
            clearInterval(poll);
            pollIntervalsRef.current.delete(item.taskId);
            toast(`${filename}: ${t.message || "处理超时"}`, "error");
          }
        } catch {
          clearInterval(poll);
          pollIntervalsRef.current.delete(item.taskId);
        }
      }, 500);
      pollIntervalsRef.current.set(item.taskId, poll);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup poll intervals on unmount
  useEffect(() => {
    return () => {
      for (const id of pollIntervalsRef.current.values()) {
        clearInterval(id);
      }
      pollIntervalsRef.current.clear();
    };
  }, []);

  // Compute KB stats
  const kbStats = useMemo(() => {
    const readyDocs = docs.filter((d) => d.status === "ready");
    return {
      doc_count: readyDocs.length,
      chunk_count: readyDocs.reduce((sum, d) => sum + d.chunk_count, 0),
      session_count: sessions.length,
      message_count: sessions.reduce((sum, s) => sum + s.message_count, 0),
    };
  }, [docs, sessions]);

  // Load KB info
  useEffect(() => {
    if (!kbIdNum) return;
    (async () => {
      try {
        const kbData = await getKB(kbIdNum);
        setKb(kbData);
        setDocs(kbData.documents ?? []);
      } catch (err) {
        toast(getErrorMessage(err));
      }
    })();
  }, [kbIdNum]);

  const refreshDocs = useCallback(async () => {
    if (!kbIdNum) return;
    try {
      setDocsLoading(true);
      const kbData = await getKB(kbIdNum);
      setKb(kbData);
      setDocs(kbData.documents ?? []);
    } catch (err) {
      toast(getErrorMessage(err));
    } finally {
      setDocsLoading(false);
    }
  }, [kbIdNum]);

  const refreshSessions = useCallback(async () => {
    try {
      const list = await listSessions(kbIdNum);
      setSessions(list);
      return list;
    } catch (err) {
      toast(getErrorMessage(err));
      return [];
    }
  }, [kbIdNum]);

  // Refresh sessions when streaming completes
  const isStreamingRef = useRef(isStreaming);
  useEffect(() => {
    if (isStreamingRef.current && !isStreaming) {
      refreshSessions();
    }
    isStreamingRef.current = isStreaming;
  }, [isStreaming, refreshSessions]);

  useEffect(() => {
    refreshDocs();
    refreshSessions().then((list) => {
      if (list.length > 0) {
        resetLoadFlag();
        setActiveSessionId(list[0].session_id);
      }
    });
  }, [refreshDocs, refreshSessions, resetLoadFlag]);

  /* ── Session search ── */
  const handleSessionSearch = useCallback(
    async (q: string) => {
      setSessionSearchQ(q);
      if (!q.trim()) {
        setSearchResults(null);
        return;
      }
      setSearching(true);
      try {
        const results = await searchMessages(kbIdNum, q.trim());
        setSearchResults(results);
      } catch {
        const local = sessions.filter((s) =>
          s.first_question?.toLowerCase().includes(q.trim().toLowerCase()),
        );
        setSearchResults(
          local.map((s) => ({
            session_id: s.session_id,
            first_question: s.first_question,
            match_snippet: "",
            updated_at: s.updated_at,
          })),
        );
      } finally {
        setSearching(false);
      }
    },
    [kbIdNum, sessions],
  );

  /* ── Session actions ── */
  const handleNewSession = useCallback(() => {
    if (messages.length === 0) return;
    resetLoadFlag();
    setActiveSessionId(null);
    clear();
  }, [messages.length, clear, resetLoadFlag]);

  const handleSessionSelect = useCallback(
    (sessionId: string) => {
      resetLoadFlag();
      setActiveSessionId(sessionId);
      setSessionSearchQ("");
      setSearchResults(null);
    },
    [resetLoadFlag],
  );

  const handleDeleteSession = useCallback((s: Session) => {
    setConfirmDeleteSession(s);
  }, []);

  const executeDeleteSession = useCallback(async () => {
    if (!confirmDeleteSession) return;
    const sid = confirmDeleteSession.session_id;
    try {
      await deleteSession(kbIdNum, sid);
      setConfirmDeleteSession(null);
      const list = await refreshSessions();
      if (activeSessionId === sid) {
        if (list.length > 0) {
          resetLoadFlag();
          setActiveSessionId(list[0].session_id);
        } else {
          setActiveSessionId(null);
          clear();
        }
      }
      toast("会话已删除", "success");
    } catch (err) {
      toast(getErrorMessage(err));
      setConfirmDeleteSession(null);
    }
  }, [kbIdNum, confirmDeleteSession, activeSessionId, refreshSessions, resetLoadFlag, clear]);

  const executeClearChat = useCallback(async () => {
    try {
      await clearMessages(kbIdNum, activeSessionId);
      setConfirmClearChat(false);
      clear();
      if (activeSessionId) refreshSessions();
      toast("聊天记录已清空", "success");
    } catch (err) {
      toast(getErrorMessage(err));
      setConfirmClearChat(false);
    }
  }, [kbIdNum, activeSessionId, clear, refreshSessions]);

  /* ── Document actions ── */
  const openNew = useCallback(() => {
    setEditDoc(null);
    setEditContent("");
    setModalOpen(true);
  }, []);

  const openEdit = useCallback(
    async (doc: Document) => {
      try {
        setEditDoc(doc);
        const { content } = await getDocContent(kbIdNum, doc.id);
        setEditContent(content);
        setModalOpen(true);
      } catch (err) {
        toast(getErrorMessage(err));
      }
    },
    [kbIdNum],
  );

  const handleCitationClick = useCallback(
    async (
      documentId: number,
      documentName: string,
      questionKeywords: string[],
      snippet: string,
    ) => {
      try {
        const { content } = await getDocContent(kbIdNum, documentId);
        const snippetKeywords = extractKeywords(snippet);
        setViewerDoc({
          filename: documentName,
          content,
          questionKeywords,
          highlightKeywords: snippetKeywords,
        });
      } catch (err) {
        toast(getErrorMessage(err));
      }
    },
    [kbIdNum, extractKeywords],
  );

  const uploadAndPoll = useCallback(
    async (file: File) => {
      const filename = file.name;
      const ext = `.${filename.split(".").pop()?.toLowerCase() ?? ""}`;
      const ALLOWED = [".txt", ".md", ".pdf", ".docx"];
      const MAX_FILE_SIZE = 50 * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE) {
        setUploadQueue((prev) => [
          ...prev,
          { filename, taskId: "", status: "error", progress: 0, error: "文件大小不能超过 50MB" },
        ]);
        toast(`${filename}: 文件大小不能超过 50MB`);
        return;
      }

      if (!ALLOWED.includes(ext)) {
        setUploadQueue((prev) => [
          ...prev,
          { filename, taskId: "", status: "error", progress: 0, error: "不支持的格式" },
        ]);
        toast(`${filename}: 不支持的格式`);
        return;
      }

      // 前端查重：按文件基础名（不含后缀）检查已有文档
      const basename = filename.replace(/\.[^.]+$/, "");
      const duplicate = docs.find((d) => {
        const existingBasename = d.filename.replace(/\.[^.]+$/, "");
        return existingBasename === basename && d.status !== "failed";
      });
      if (duplicate) {
        setUploadQueue((prev) => [
          ...prev,
          {
            filename,
            taskId: "",
            status: "error",
            progress: 0,
            error: `与已有文档「${duplicate.filename}」同名`,
          },
        ]);
        toast(`${filename}: 知识库中已存在同名文档`, "error");
        return;
      }

      toast(`${filename} 上传中…`, "info");

      try {
        const result = await uploadFileAsync(kbIdNum, file);
        const item: (typeof uploadQueue)[number] = {
          filename,
          taskId: result.task_id,
          status: result.sync ? "done" : "uploading",
          progress: 0,
        };
        setUploadQueue((prev) => [...prev, item]);
        setShowUploadProgress(true);

        if (result.sync) {
          toast(`${filename} 上传完成`, "success");
          refreshDocs();
          return;
        }

        const startTime = Date.now();
        const MAX_POLL_MS = 1_920_000;
        const poll = setInterval(async () => {
          try {
            const t = await pollTask(result.task_id);
            const elapsed = Date.now() - startTime;

            const newStatus =
              t.status === "failed"
                ? "error"
                : t.status === "done"
                  ? "done"
                  : elapsed > MAX_POLL_MS
                    ? "error"
                    : "uploading";
            const newError =
              t.status === "failed"
                ? t.message
                : elapsed > MAX_POLL_MS
                  ? "处理超时，请重试"
                  : undefined;

            // Only update state if something changed (prevents flicker)
            setUploadQueue((prev) => {
              const existing = prev.find((q) => q.taskId === result.task_id);
              if (
                existing &&
                existing.status === newStatus &&
                existing.progress === t.progress
              ) {
                return prev;
              }
              return prev.map((q) =>
                q.taskId === result.task_id
                  ? { ...q, status: newStatus, progress: t.progress, error: newError }
                  : q,
              );
            });
            if (t.status === "done") {
              clearInterval(poll);
              pollIntervalsRef.current.delete(result.task_id);
              toast(`${filename} 上传完成`, "success");
              setTimeout(() => refreshDocs(), 500);
              setTimeout(() => refreshDocs(), 2000);
            } else if (t.status === "failed" || elapsed > MAX_POLL_MS) {
              clearInterval(poll);
              pollIntervalsRef.current.delete(result.task_id);
              toast(`${filename}: ${t.message || "处理超时"}`, "error");
            }
          } catch {
            clearInterval(poll);
            pollIntervalsRef.current.delete(result.task_id);
          }
        }, 500);
        pollIntervalsRef.current.set(result.task_id, poll);
      } catch (err) {
        setUploadQueue((prev) => [
          ...prev,
          { filename, taskId: "", status: "error", progress: 0, error: getErrorMessage(err) },
        ]);
        toast(`${filename}: ${getErrorMessage(err)}`, "error");
      }
    },
    [kbIdNum, refreshDocs, docs],
  );

  /* ── Upload progress actions ── */
  const handleStopUpload = useCallback((taskId: string) => {
    const interval = pollIntervalsRef.current.get(taskId);
    if (interval) {
      clearInterval(interval);
      pollIntervalsRef.current.delete(taskId);
    }
    setUploadQueue((prev) =>
      prev.map((q) =>
        q.taskId === taskId ? { ...q, status: "error", progress: 0, error: "已终止" } : q,
      ),
    );
    toast("上传已终止", "info");
  }, []);

  const handleRemoveUploadItem = useCallback((taskId: string) => {
    setUploadQueue((prev) => prev.filter((q) => q.taskId !== taskId));
  }, []);

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      if (fileInputRef.current) fileInputRef.current.value = "";

      for (const file of files) {
        await uploadAndPoll(file);
      }
    },
    [uploadAndPoll],
  );

  /* ── Drag-and-drop upload ── */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items?.length > 0) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files ?? []);
      if (files.length === 0) return;

      for (const file of files) {
        await uploadAndPoll(file);
      }
      setTimeout(() => refreshDocs(), 2000);
    },
    [uploadAndPoll, refreshDocs],
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (isStreaming || !text) return;
    prepareSend();
    let sid = activeSessionId;
    if (!sid) {
      sid = `sess_${crypto.randomUUID()}`;
      flushSync(() => setActiveSessionId(sid));
    }
    send(text, sid);
    setInput("");
    setTimeout(() => refreshSessions(), 500);
  }, [input, isStreaming, send, refreshSessions, activeSessionId, prepareSend]);

  /* ── Edit message ── */
  const handleEditMessage = useCallback(
    (msgIndex: number, newContent: string) => {
      flushSync(() => truncateAt(msgIndex));
      send(newContent);
      setTimeout(() => refreshSessions(), 500);
    },
    [send, truncateAt, refreshSessions],
  );

  /* ── Regenerate ── */
  const handleRegenerate = useCallback(
    (msgIndex: number) => {
      const prevUserMsg = messages[msgIndex - 1];
      if (!prevUserMsg || prevUserMsg.role !== "user") return;
      const question = prevUserMsg.content;

      flushSync(() => truncateAt(msgIndex));
      resend(question);
      setTimeout(() => refreshSessions(), 500);
    },
    [messages, resend, truncateAt, refreshSessions],
  );

  const handleQuestionSelect = useCallback((q: string) => {
    setInput(q);
    const inp = document.querySelector<HTMLInputElement>('input[placeholder*="Enter"]');
    inp?.focus();
  }, []);

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const displayName = activeSessionId
    ? (sessions.find((s) => s.session_id === activeSessionId)?.first_question ?? "新的对话")
    : "新的对话";

  return (
    <div
      className="flex gap-4 md:gap-6 max-w-6xl mx-auto relative"
      style={{ height: "calc(100vh - 120px)" }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center rounded-xl animate-fade-in-up"
          style={{
            backgroundColor: "var(--overlay)",
            border: "2px dashed var(--color-copper)",
          }}
        >
          <div className="text-center pointer-events-none">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="mx-auto mb-2"
              style={{ color: "var(--color-copper)" }}
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-sm font-medium" style={{ color: "var(--color-copper)" }}>
              释放文件以上传
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              支持 .txt、.md、.pdf、.docx
            </p>
          </div>
        </div>
      )}

      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div
          className="fixed inset-0 z-40 md:hidden"
          style={{ backgroundColor: "var(--overlay)", backdropFilter: "blur(2px)" }}
          onClick={() => setShowSidebar(false)}
          aria-hidden="true"
        />
      )}

      {/* Left sidebar */}
      <ChatSidebar
        kb={kb}
        sessions={sessions}
        activeSessionId={activeSessionId}
        sessionSearchQ={sessionSearchQ}
        searchResults={searchResults}
        searching={searching}
        uploadQueue={uploadQueue}
        readyDocCount={readyDocs.length}
        showSidebar={showSidebar}
        onNewDoc={openNew}
        onUploadClick={handleUploadClick}
        onShowDocManage={() => setShowDocManage(true)}
        onShowUploadProgress={() => setShowUploadProgress(true)}
        onNewSession={handleNewSession}
        onSessionSelect={handleSessionSelect}
        onDeleteSession={handleDeleteSession}
        onSessionSearch={handleSessionSearch}
      />

      {/* Hidden file input (kept here so ref is accessible) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.pdf,.docx"
        multiple
        className="hidden"
        onChange={handleFileUpload}
        aria-label="上传文件"
      />

      {/* Chat area */}
      <div className="flex-1 flex flex-col card p-0 overflow-hidden">
        {/* Chat header */}
        <div
          className="flex items-center justify-between px-5 py-3 shrink-0"
          style={{ borderBottom: "var(--border-light)" }}
        >
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="md:hidden p-1 rounded transition-colors shrink-0"
              style={{ color: "var(--text-secondary)" }}
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label={showSidebar ? "关闭侧栏" : "打开侧栏"}
              aria-expanded={showSidebar}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {showSidebar ? (
                  <>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </>
                ) : (
                  <>
                    <line x1="3" y1="12" x2="21" y2="12" />
                    <line x1="3" y1="6" x2="21" y2="6" />
                    <line x1="3" y1="18" x2="21" y2="18" />
                  </>
                )}
              </svg>
            </button>
            <h2
              className="display-text text-sm font-semibold truncate max-w-[200px] md:max-w-[300px]"
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
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <>
                <button
                  type="button"
                  className="text-xs font-medium transition-colors px-2 py-1 rounded-md"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => exportConversation(messages, displayName)}
                >
                  导出
                </button>
                <button
                  type="button"
                  className="text-xs font-medium transition-colors px-2 py-1 rounded-md"
                  style={{ color: "var(--text-muted)" }}
                  onClick={() => setConfirmClearChat(true)}
                >
                  清空
                </button>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messagesLoading ? (
            <ChatSkeleton />
          ) : messages.length === 0 ? (
            <DashboardView
              kb={kb}
              kbStats={kbStats}
              docs={docs}
              onQuestionSelect={handleQuestionSelect}
            />
          ) : (
            messages.map((m, i) => {
              const prevMsg = i > 0 ? messages[i - 1] : null;
              const citationKeywords =
                m.role === "assistant" && prevMsg?.role === "user"
                  ? extractKeywords(prevMsg.content)
                  : [];
              return (
                <ChatMessage
                  key={m.id}
                  msg={m}
                  msgIndex={i}
                  citationKeywords={citationKeywords}
                  onCitationClick={handleCitationClick}
                  onEditMessage={handleEditMessage}
                  onRegenerate={handleRegenerate}
                  isStreaming={isStreaming}
                />
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div className="px-5 py-3 shrink-0" style={{ borderTop: "var(--border-light)" }}>
          <div className="mb-2">
            <PromptTemplates onSelect={(prompt) => setInput(prompt)} disabled={isStreaming} />
          </div>
          <div className="flex gap-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              maxLength={4000}
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
                e.target.style.borderColor = "var(--border-color-medium)";
              }}
              disabled={isStreaming}
              aria-label="输入问题"
            />
            <button
              type="button"
              className="px-4 py-2.5 rounded-lg transition-all duration-200 disabled:opacity-40 flex items-center gap-1.5"
              style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
              disabled={isStreaming || !input.trim()}
              onClick={handleSend}
              aria-label="发送消息"
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
          {input.length > 3000 && (
            <div
              className="flex justify-end mt-1 text-[10px] tabular-nums"
              style={{ color: input.length >= 3900 ? "var(--danger)" : "var(--text-muted)" }}
            >
              {input.length}/4000
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {modalOpen && (
        <DocEditorModal
          kbId={kbIdNum}
          editDoc={editDoc}
          initialContent={editContent}
          onClose={() => setModalOpen(false)}
          onSaved={refreshDocs}
        />
      )}
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
      {viewerDoc && (
        <DocViewerModal
          filename={viewerDoc.filename}
          content={viewerDoc.content}
          questionKeywords={viewerDoc.questionKeywords}
          highlightKeywords={viewerDoc.highlightKeywords}
          onClose={() => setViewerDoc(null)}
        />
      )}
      {confirmClearChat && (
        <ConfirmDialog
          title="清空聊天记录"
          message={
            activeSessionId
              ? "清空当前会话的所有聊天记录？此操作不可撤销。"
              : "清空所有未关联会话的聊天记录？此操作不可撤销。"
          }
          confirmLabel="确认清空"
          danger
          onConfirm={executeClearChat}
          onCancel={() => setConfirmClearChat(false)}
        />
      )}
      {showDocManage && (
        <DocManageModal
          docs={docs}
          kbId={kbIdNum}
          onClose={() => setShowDocManage(false)}
          onDocClick={openEdit}
          onSaved={refreshDocs}
        />
      )}
      {showUploadProgress && (
        <UploadProgressModal
          items={uploadQueue}
          onClose={() => setShowUploadProgress(false)}
          onRemove={handleRemoveUploadItem}
          onStop={handleStopUpload}
        />
      )}
    </div>
  );
}
