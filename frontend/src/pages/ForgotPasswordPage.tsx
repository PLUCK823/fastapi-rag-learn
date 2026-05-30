import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "../stores/toastStore";
import { getErrorMessage } from "../utils/error";
import api from "../api/client";

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
    <div className="min-h-screen flex" style={{ backgroundColor: "var(--surface-bg)" }}>
      {/* Left: illustration */}
      <div className="hidden lg:flex w-1/2 items-center justify-center p-12">
        <div className="max-w-md animate-fade-in-up">
          <svg width="200" height="200" viewBox="0 0 200 200" fill="none" aria-hidden="true">
            <circle cx="100" cy="100" r="98" stroke="var(--color-copper)" strokeWidth="1.5" strokeDasharray="6 4" />
            <circle cx="100" cy="100" r="60" stroke="var(--color-copper)" strokeWidth="1" opacity="0.3" />
            <path d="M70 100 L90 115 L130 85" stroke="var(--accent-sage)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in-up">
          <h1 className="display-text text-2xl mb-2" style={{ color: "var(--color-ink)" }}>
            忘记密码
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            {sent ? "请查看后端日志获取重置 token" : "输入注册邮箱，我们将发送重置链接"}
          </p>

          {!sent ? (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder="name@example.com"
                className="w-full px-4 py-3 rounded-lg text-sm outline-none mb-4 transition-colors"
                style={{
                  backgroundColor: "var(--surface-card)",
                  border: "var(--border-medium)",
                  color: "var(--text-primary)",
                }}
                onFocus={(e) => { e.target.style.borderColor = "var(--color-copper)"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border-color-medium)"; }}
              />
              <button
                type="button"
                className="w-full py-3 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50 mb-4"
                style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? "发送中..." : "发送重置邮件"}
              </button>
            </>
          ) : (
            <div className="mb-4 px-4 py-3 rounded-lg text-sm" style={{ backgroundColor: "var(--success-bg)", color: "var(--accent-sage)" }}>
              邮件已发送（开发模式请查看后端日志）
            </div>
          )}

          <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
            <Link to="/login" className="no-underline hover:underline" style={{ color: "var(--accent)" }}>
              返回登录
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
