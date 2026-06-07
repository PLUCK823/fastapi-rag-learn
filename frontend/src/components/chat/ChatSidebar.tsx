import type { KBDetail, SearchResult, Session } from "../../types";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

interface ChatSidebarProps {
  kb: KBDetail | null;
  sessions: Session[];
  activeSessionId: string | null;
  sessionSearchQ: string;
  searchResults: SearchResult[] | null;
  searching: boolean;
  uploadQueue: { status: string }[];
  readyDocCount: number;
  showSidebar: boolean;
  onNewDoc: () => void;
  onUploadClick: () => void;
  onShowDocManage: () => void;
  onShowUploadProgress: () => void;
  onNewSession: () => void;
  onSessionSelect: (sessionId: string) => void;
  onDeleteSession: (session: Session) => void;
  onSessionSearch: (q: string) => void;
}

export default function ChatSidebar({
  kb,
  sessions,
  activeSessionId,
  sessionSearchQ,
  searchResults,
  searching,
  uploadQueue,
  readyDocCount,
  showSidebar,
  onNewDoc,
  onUploadClick,
  onShowDocManage,
  onShowUploadProgress,
  onNewSession,
  onSessionSelect,
  onDeleteSession,
  onSessionSearch,
}: ChatSidebarProps) {
  const hasSearchResults = searchResults !== null;

  return (
    <aside
      className={
        "w-56 shrink-0 card p-4 flex flex-col overflow-hidden z-50 " +
        (showSidebar ? "fixed inset-y-0 left-0 " : "hidden ") +
        "md:relative md:flex"
      }
    >
      <h2
        className="display-text text-sm font-semibold truncate mb-3"
        style={{ color: "var(--text-primary)" }}
      >
        {kb?.name ?? "..."}
      </h2>

      {/* Action buttons */}
      <div className="flex gap-1.5 mb-3">
        <button
          type="button"
          className="flex-1 text-xs font-medium py-1.5 rounded-md transition-colors"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
          onClick={onNewDoc}
          aria-label="新建文档"
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
          onClick={onUploadClick}
          aria-label="上传文件"
        >
          上传
        </button>
      </div>

      {/* Upload progress */}
      <button
        type="button"
        className="w-full mb-3 px-3 py-2 rounded-md text-xs text-left transition-colors"
        style={{
          backgroundColor: "var(--surface-bg)",
          color: uploadQueue.length > 0 ? "var(--text-secondary)" : "var(--text-muted)",
        }}
        onClick={onShowUploadProgress}
        aria-label="查看上传进度"
      >
        <span className="font-medium">上传进度</span>
        {uploadQueue.length > 0 ? (
          <>
            <span className="ml-1" style={{ color: "var(--text-muted)" }}>
              ({uploadQueue.filter((q) => q.status === "done").length}/{uploadQueue.length})
            </span>
            {uploadQueue.some((q) => q.status === "uploading") && (
              <span
                className="ml-2 inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ backgroundColor: "var(--accent)" }}
              />
            )}
          </>
        ) : (
          <span className="ml-1" style={{ color: "var(--text-muted)" }}>
            (空)
          </span>
        )}
      </button>

      {/* Sessions section */}
      <div
        className="pb-2 mb-2 flex flex-col overflow-hidden"
        style={{ borderBottom: "var(--border-light)", flex: "1 1 0%" }}
      >
        <div className="flex items-center justify-between mb-1 shrink-0">
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
            onClick={onNewSession}
            aria-label="新建会话"
          >
            + 新建
          </button>
        </div>

        {/* Session search */}
        <div className="mb-2 shrink-0">
          <input
            value={sessionSearchQ}
            onChange={(e) => onSessionSearch(e.target.value)}
            placeholder="搜索对话…"
            className="w-full px-2 py-1 rounded-md text-[11px] outline-none transition-colors"
            style={{
              backgroundColor: "var(--surface-bg)",
              border: "var(--border-light)",
              color: "var(--text-primary)",
            }}
            aria-label="搜索会话"
          />
        </div>

        <div className="overflow-y-auto flex-1 -mx-4 px-4">
          {hasSearchResults ? (
            searchResults?.length === 0 ? (
              <p className="text-[10px] py-1" style={{ color: "var(--text-muted)" }}>
                {searching ? "搜索中…" : "无匹配会话"}
              </p>
            ) : (
              searchResults?.map((r) => (
                <button
                  key={r.session_id}
                  type="button"
                  className="w-full text-left py-1.5 text-xs rounded px-1 transition-colors mb-0.5"
                  style={{ color: "var(--text-secondary)" }}
                  onClick={() => onSessionSelect(r.session_id)}
                >
                  <span className="block truncate text-[11px] font-medium">
                    {r.first_question || "新的对话"}
                  </span>
                  {r.match_snippet && (
                    <span
                      className="block truncate text-[10px] mt-0.5"
                      style={{ color: "var(--text-muted)" }}
                    >
                      …{r.match_snippet}…
                    </span>
                  )}
                </button>
              ))
            )
          ) : sessions.length === 0 ? (
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
                    className={`text-left truncate flex-1 mr-1 py-0.5 rounded px-1 transition-colors ${isActive ? "font-medium" : ""}`}
                    style={{
                      color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                      backgroundColor: isActive ? "var(--surface-bg)" : "transparent",
                    }}
                    onClick={() => onSessionSelect(s.session_id)}
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
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shrink-0 px-1 py-0.5 rounded text-[10px]"
                    style={{ color: "var(--text-muted)" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(s);
                    }}
                    aria-label={`删除会话: ${s.first_question || "新的对话"}`}
                  >
                    删除
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Document management button */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors shrink-0"
        style={{
          backgroundColor: "var(--surface-bg)",
          color: "var(--text-secondary)",
        }}
        onClick={onShowDocManage}
        aria-label="文档管理"
      >
        <span className="flex items-center gap-1.5">
          <span className="font-medium">文档管理</span>
          <span style={{ color: "var(--text-muted)" }}>({readyDocCount} 篇)</span>
        </span>
        <span style={{ color: "var(--text-muted)" }}>→</span>
      </button>
    </aside>
  );
}
