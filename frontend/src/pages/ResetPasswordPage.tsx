import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../api/client";
import AuthHeader from "../components/shared/AuthHeader";
import { toast } from "../stores/toastStore";
import { getErrorMessage } from "../utils/error";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!token.trim()) {
      toast("请输入重置 token", "info");
      return;
    }
    if (!password.trim() || password.trim().length < 6) {
      toast("密码至少需要 6 个字符", "info");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token: token.trim(), password: password.trim() });
      toast("密码已重置，请登录", "success");
      navigate("/login");
    } catch (err) {
      toast(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--surface-bg)" }}>
      <AuthHeader />

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
            <div className="text-center mb-8">
              <h1
                className="display-text text-2xl sm:text-3xl mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                重置密码
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                输入邮件中的重置 token 和新密码
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  重置 Token
                </label>
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="粘贴邮件中的 token"
                  className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200 font-mono"
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
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  新密码
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
                    placeholder="至少 6 个字符"
                    minLength={6}
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
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-[0.99]"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
              >
                {loading ? "重置中..." : "重置密码"}
              </button>
            </div>

            <p className="text-center text-sm mt-8" style={{ color: "var(--text-muted)" }}>
              <Link
                to="/login"
                className="font-semibold hover:underline"
                style={{ color: "var(--accent)" }}
              >
                返回登录
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
