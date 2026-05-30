import { useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import AuthHeader from "../components/shared/AuthHeader";
import { toast } from "../stores/toastStore";
import { getErrorMessage } from "../utils/error";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!email.trim()) {
      toast("请输入邮箱地址", "info");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email: email.trim() });
      setSent(true);
      toast("重置邮件已发送（开发模式下请查看后端日志获取 token）", "info");
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
                忘记密码
              </h1>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {sent ? "请查看后端日志获取重置 token" : "输入注册邮箱，我们将发送重置链接"}
              </p>
            </div>

            {sent ? (
              <div
                className="px-4 py-4 rounded-xl text-sm flex items-start gap-3"
                style={{
                  backgroundColor: "var(--success-bg)",
                  border: "1px solid var(--success-border)",
                  color: "var(--accent-sage)",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  className="mt-px shrink-0"
                  aria-hidden="true"
                >
                  <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
                  <path
                    d="M5.5 8l2 2 3.5-4"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>邮件已发送（开发模式请查看后端日志）</span>
              </div>
            ) : (
              <div className="space-y-5">
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
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSubmit();
                    }}
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
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 active:scale-[0.99]"
                  style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
                >
                  {loading ? "发送中..." : "发送重置邮件"}
                </button>
              </div>
            )}

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
