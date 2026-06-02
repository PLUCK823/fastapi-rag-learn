import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login, register } from "../api/auth";
import AuthHeader from "../components/shared/AuthHeader";
import { useAuthStore } from "../stores/authStore";
import { toast } from "../stores/toastStore";
import { getErrorMessage } from "../utils/error";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast("请输入邮箱地址", "error");
      return;
    }
    if (!password.trim()) {
      toast("请输入密码", "error");
      return;
    }
    if (password.length < 6) {
      toast("密码至少需要 6 个字符", "error");
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
      const data = await login(email, password);
      setToken(data.access_token);
      navigate("/");
    } catch (err) {
      toast(getErrorMessage(err), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--surface-bg)" }}>
      <AuthHeader />

      {/* Centered card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          <div
            className="px-6 sm:px-10 py-10 sm:py-12 rounded-2xl"
            style={{
              backgroundColor: "var(--surface-card)",
              border: "var(--border-light)",
              boxShadow: "var(--shadow-lg)",
            }}
          >
            {/* Header */}
            <div className="text-center mb-8">
              <h1
                className="display-text text-2xl sm:text-3xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                创建你的账号
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                开始构建你的专属知识库
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  邮箱地址
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                  style={{
                    backgroundColor: "var(--surface-bg)",
                    border: "var(--border-medium)",
                    color: "var(--text-primary)",
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = "var(--color-ink)";
                    e.target.style.boxShadow = "0 0 0 3px rgba(28, 28, 46, 0.06)";
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = "var(--border-color-medium)";
                    e.target.style.boxShadow = "none";
                  }}
                  required
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="至少 6 个字符"
                    className="w-full px-4 py-3 pr-12 rounded-xl text-sm outline-none transition-all duration-200"
                    style={{
                      backgroundColor: "var(--surface-bg)",
                      border: "var(--border-medium)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "var(--color-ink)";
                      e.target.style.boxShadow = "0 0 0 3px rgba(28, 28, 46, 0.06)";
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = "var(--border-color-medium)";
                      e.target.style.boxShadow = "none";
                    }}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors hover:opacity-60"
                    style={{ color: "var(--text-muted)" }}
                    aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  >
                    {showPassword ? (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      >
                        <title>隐藏密码</title>
                        <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <title>显示密码</title>
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-[0.99]"
                style={{
                  backgroundColor: "var(--color-ink)",
                  color: "var(--color-cream)",
                }}
              >
                {loading ? "注册中..." : "注册"}
              </button>
            </form>

            {/* Footer */}
            <p className="text-center text-sm mt-8" style={{ color: "var(--text-muted)" }}>
              已有账号？{" "}
              <Link
                to="/login"
                className="font-semibold hover:underline"
                style={{ color: "var(--accent)" }}
              >
                登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
