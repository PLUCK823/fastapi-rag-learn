import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { getErrorMessage } from "../utils/error";

const EMPTY_STATE_ILLUSTRATION = (
  <svg
    viewBox="0 0 240 160"
    className="w-full max-w-[320px] mx-auto opacity-30"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="知识库插画"
  >
    <title>知识库插画</title>
    <rect x="40" y="20" width="160" height="120" rx="8" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="100" cy="65" r="14" stroke="currentColor" strokeWidth="1.5" />
    <path d="M86 78c4 8 24 8 28 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <line x1="80" y1="98" x2="160" y2="98" stroke="currentColor" strokeWidth="1" opacity="0.5" />
    <line x1="70" y1="108" x2="150" y2="108" stroke="currentColor" strokeWidth="1" opacity="0.3" />
  </svg>
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(() => {
    const msg = sessionStorage.getItem("login_message");
    if (msg) {
      sessionStorage.removeItem("login_message");
      return msg;
    }
    return "";
  });
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("请输入邮箱地址");
      return;
    }
    if (!password.trim()) {
      setError("请输入密码");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--surface-bg)" }}>
      {/* Left — illustration & brand */}
      <div
        className="hidden lg:flex w-5/12 relative overflow-hidden flex-col items-center justify-center px-12"
        style={{ backgroundColor: "var(--color-ink)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `radial-gradient(circle at 20% 50%, var(--color-cream) 1px, transparent 1px)`,
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative z-10 text-center max-w-sm">
          {EMPTY_STATE_ILLUSTRATION}
          <h1
            className="display-text text-3xl mt-10 mb-4 tracking-tight"
            style={{ color: "var(--color-cream)" }}
          >
            RAG Learn
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            构建知识库，让 AI 理解你的文档。
            <br />
            检索增强生成，从此刻开始。
          </p>
        </div>
      </div>

      {/* Right — login form */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-sm animate-fade-in-up">
          {/* Mobile brand */}
          <h1
            className="display-text text-2xl text-center mb-8 lg:hidden"
            style={{ color: "var(--color-ink)" }}
          >
            RAG Learn
          </h1>

          <h2 className="display-text text-xl mb-1" style={{ color: "var(--text-primary)" }}>
            登录
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            欢迎回来，请登录你的账号
          </p>

          {error && (
            <div
              className="mb-6 px-4 py-3 rounded-lg text-sm"
              style={{
                backgroundColor: "var(--danger-bg)",
                color: "var(--danger)",
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                邮箱
              </label>
              <input
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: "var(--surface-card)",
                  border: "var(--border-medium)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--color-copper)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border-color-medium)";
                }}
                required
              />
            </div>
            <div>
              <label
                className="block text-xs font-medium mb-1.5"
                style={{ color: "var(--text-secondary)" }}
              >
                密码
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg text-sm outline-none transition-colors"
                style={{
                  backgroundColor: "var(--surface-card)",
                  border: "var(--border-medium)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = "var(--color-copper)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "var(--border-color-medium)";
                }}
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
              style={{
                backgroundColor: "var(--color-ink)",
                color: "var(--color-cream)",
              }}
            >
              {loading ? "登录中..." : "登录"}
            </button>
          </form>

          <p className="text-center text-xs mt-8" style={{ color: "var(--text-muted)" }}>
            还没有账号？{" "}
            <Link
              to="/register"
              className="font-medium hover:underline transition-colors"
              style={{ color: "var(--accent)" }}
            >
              注册
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
