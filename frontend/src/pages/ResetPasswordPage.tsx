import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "../stores/toastStore";
import { getErrorMessage } from "../utils/error";
import api from "../api/client";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
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
      await api.post("/auth/reset-password", {
        token: token.trim(),
        password: password.trim(),
      });
      toast("密码已重置，请登录", "success");
      navigate("/login");
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
            <rect x="40" y="55" width="120" height="90" rx="8" stroke="var(--color-copper)" strokeWidth="2" />
            <circle cx="80" cy="85" r="8" stroke="var(--color-copper)" strokeWidth="1.5" />
            <circle cx="100" cy="85" r="8" stroke="var(--color-copper)" strokeWidth="1.5" />
            <circle cx="120" cy="85" r="8" stroke="var(--color-copper)" strokeWidth="1.5" />
          </svg>
        </div>
      </div>

      {/* Right: form */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm animate-fade-in-up">
          <h1 className="display-text text-2xl mb-2" style={{ color: "var(--color-ink)" }}>
            重置密码
          </h1>
          <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
            输入邮件中的重置 token 和新密码
          </p>

          <input
            type="text"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="重置 token"
            className="w-full px-4 py-3 rounded-lg text-sm outline-none mb-4 transition-colors font-mono"
            style={{
              backgroundColor: "var(--surface-card)",
              border: "var(--border-medium)",
              color: "var(--text-primary)",
            }}
            onFocus={(e) => { e.target.style.borderColor = "var(--color-copper)"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border-color-medium)"; }}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="新密码（至少 6 个字符）"
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
            {loading ? "重置中..." : "重置密码"}
          </button>

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
