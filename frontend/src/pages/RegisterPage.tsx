import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, register } from "../api/auth";
import { useAuthStore } from "../stores/authStore";
import { getErrorMessage } from "../utils/error";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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
    if (password.length < 6) {
      setError("密码至少需要 6 个字符");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await register(email, password);
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
      {/* Left — register form */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-sm animate-fade-in-up">
          <h1
            className="display-text text-2xl text-center mb-8 lg:hidden"
            style={{ color: "var(--color-ink)" }}
          >
            RAG Learn
          </h1>

          <h2 className="display-text text-xl mb-1" style={{ color: "var(--text-primary)" }}>
            注册
          </h2>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            创建账号，开始构建你的知识库
          </p>

          {error && (
            <div
              className="mb-6 px-4 py-3 rounded-lg text-sm"
              style={{
                backgroundColor: "rgba(181, 91, 91, 0.08)",
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
                  e.target.style.borderColor = "rgba(28,28,46,0.1)";
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
                placeholder="至少 6 个字符"
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
                  e.target.style.borderColor = "rgba(28,28,46,0.1)";
                }}
                required
                minLength={6}
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
              {loading ? "注册中..." : "注册并登录"}
            </button>
          </form>

          <p className="text-center text-xs mt-8" style={{ color: "var(--text-muted)" }}>
            已有账号？{" "}
            <Link
              to="/login"
              className="font-medium hover:underline transition-colors"
              style={{ color: "var(--accent)" }}
            >
              登录
            </Link>
          </p>
        </div>
      </div>

      {/* Right — decorative panel */}
      <div
        className="hidden lg:flex w-5/12 relative overflow-hidden flex-col items-center justify-center px-12"
        style={{ backgroundColor: "var(--color-ink)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 80% 50%, var(--color-cream) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="relative z-10 text-center max-w-sm">
          <h1
            className="display-text text-3xl mb-4 tracking-tight"
            style={{ color: "var(--color-cream)" }}
          >
            一切从知识开始
          </h1>
          <p className="text-sm leading-relaxed" style={{ color: "var(--color-ink-muted)" }}>
            上传文档、提问、获取答案。
            <br />
            RAG 让 AI 真正理解你的内容。
          </p>
        </div>
      </div>
    </div>
  );
}
