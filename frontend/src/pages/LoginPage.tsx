import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login } from "../api/auth";
import { useAuthStore } from "../stores/authStore";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const setToken = useAuthStore((s) => s.setToken);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const data = await login(email, password);
      setToken(data.access_token);
      navigate("/");
    } catch {
      setError("登录失败，请检查邮箱和密码");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-sm w-full max-w-sm">
        <h1 className="text-xl font-bold mb-6 text-center">登录</h1>
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <input
          type="email"
          placeholder="邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-3 text-sm"
          required
        />
        <input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2 mb-4 text-sm"
          required
        />
        <button
          type="submit"
          className="w-full bg-purple-600 text-white rounded py-2 text-sm hover:bg-purple-700"
        >
          登录
        </button>
        <p className="text-center text-xs text-gray-500 mt-4">
          还没有账号？
          <Link to="/register" className="text-purple-600 hover:underline">
            注册
          </Link>
        </p>
      </form>
    </div>
  );
}
