import { Link, Outlet, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

export default function AppLayout() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-bold text-lg text-purple-700">
            RAG Learn
          </Link>
          <Link to="/" className="text-sm text-gray-600 hover:text-purple-700">
            知识库
          </Link>
        </div>
        <button
          type="button"
          className="text-sm text-gray-500 hover:text-red-600"
          onClick={() => {
            logout();
            navigate("/login");
          }}
        >
          退出登录
        </button>
      </nav>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
