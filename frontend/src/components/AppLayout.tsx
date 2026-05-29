import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { changePassword, getProfile, updateNickname } from "../api/auth";
import { useAuthStore } from "../stores/authStore";

/* ── Static JSX hoisted outside component ── */
const NAV_BRAND = (
  <Link
    to="/"
    className="display-text text-lg tracking-tight no-underline"
    style={{ color: "var(--color-ink)" }}
  >
    RAG Learn
  </Link>
);

/* ── SettingsModal extracted as standalone (rerender-no-inline-components) ── */
function SettingsModal({
  initialNickname,
  email,
  onClose,
}: {
  initialNickname: string;
  email: string;
  onClose: () => void;
}) {
  const [newNick, setNewNick] = useState(initialNickname);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");
  const [msgType, setMsgType] = useState<"success" | "error">("success");

  const showMsg = (text: string, type: "success" | "error" = "success") => {
    setMsg(text);
    setMsgType(type);
  };

  const handleNickname = useCallback(async () => {
    await updateNickname(newNick);
    showMsg("昵称已更新");
  }, [newNick]);

  const handlePassword = useCallback(async () => {
    if (!oldPw.trim() || !newPw.trim()) {
      showMsg("请填写原密码和新密码", "error");
      return;
    }
    try {
      await changePassword(oldPw, newPw);
      showMsg("密码已修改");
      setOldPw("");
      setNewPw("");
    } catch {
      showMsg("密码修改失败，原密码不正确", "error");
    }
  }, [oldPw, newPw]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: "rgba(28, 28, 46, 0.3)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        className="card p-6 w-full max-w-sm animate-fade-in-up"
        style={{ animationDelay: "50ms" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="display-text text-base" style={{ color: "var(--text-primary)" }}>
            个人设置
          </h2>
          <button
            type="button"
            className="text-lg leading-none p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {msg && (
          <p
            className="text-xs mb-4 px-3 py-2 rounded-md"
            style={{
              backgroundColor:
                msgType === "success" ? "rgba(122,139,110,0.1)" : "rgba(181,91,91,0.08)",
              color: msgType === "success" ? "var(--accent-sage)" : "var(--danger)",
            }}
          >
            {msg}
          </p>
        )}

        {/* Nickname */}
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--text-secondary)" }}
        >
          昵称
        </label>
        <div className="flex gap-2 mb-5">
          <input
            value={newNick}
            onChange={(e) => setNewNick(e.target.value)}
            placeholder={email}
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: "var(--surface-bg)",
              border: "var(--border-medium)",
              color: "var(--text-primary)",
            }}
          />
          <button
            type="button"
            className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
            style={{
              backgroundColor: "var(--color-ink)",
              color: "var(--color-cream)",
            }}
            onClick={handleNickname}
          >
            保存
          </button>
        </div>

        {/* Password */}
        <label
          className="block text-xs font-medium mb-1.5"
          style={{ color: "var(--text-secondary)" }}
        >
          修改密码
        </label>
        <div className="space-y-2 mb-4">
          <input
            type="password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
            placeholder="原密码"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: "var(--surface-bg)",
              border: "var(--border-medium)",
              color: "var(--text-primary)",
            }}
          />
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            placeholder="新密码（至少 6 字符）"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: "var(--surface-bg)",
              border: "var(--border-medium)",
              color: "var(--text-primary)",
            }}
          />
        </div>
        <button
          type="button"
          className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-cream)",
          }}
          onClick={handlePassword}
        >
          修改密码
        </button>
      </div>
    </div>
  );
}

/* ── Main AppLayout ── */
export default function AppLayout() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getProfile().then((p) => {
      setNickname(p.nickname || "");
      setEmail(p.email);
    });
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const displayName = nickname || email || "用户";

  return (
    <div className="min-h-screen" style={{ backgroundColor: "var(--surface-bg)" }}>
      {/* Nav */}
      <nav
        className="sticky top-0 z-40 px-6 py-3 flex items-center justify-between border-b"
        style={{
          backgroundColor: "var(--surface-nav)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          borderBottom: "var(--border-light)",
        }}
      >
        <div className="flex items-center gap-6">
          {NAV_BRAND}
          <Link
            to="/"
            className="text-sm font-medium transition-colors no-underline"
            style={{ color: "var(--text-secondary)" }}
          >
            知识库
          </Link>
        </div>

        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onClick={() => setShowMenu(!showMenu)}
          >
            {displayName}
          </button>
          {showMenu && (
            <div
              className="absolute right-0 mt-2 w-44 card py-1 animate-fade-in-up z-10 overflow-hidden"
              style={{ animationDuration: "150ms" }}
            >
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--surface-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  setShowSettings(true);
                  setShowMenu(false);
                }}
              >
                个人设置
              </button>
              <div style={{ borderTop: "var(--border-light)" }} />
              <button
                type="button"
                className="w-full text-left px-4 py-2.5 text-sm transition-colors"
                style={{ color: "var(--danger)" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--surface-bg)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                退出登录
              </button>
            </div>
          )}
        </div>
      </nav>

      {/* Content */}
      <main className="px-6 py-8">
        <Outlet />
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          initialNickname={nickname}
          email={email}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
