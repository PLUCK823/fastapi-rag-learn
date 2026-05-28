import { useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { changePassword, getProfile, updateNickname } from "../api/auth";
import { useAuthStore } from "../stores/authStore";

export default function AppLayout() {
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [newNick, setNewNick] = useState("");
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getProfile().then((p) => {
      setNickname(p.nickname || "");
      setEmail(p.email);
      setNewNick(p.nickname || "");
    });
  }, []);

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
        <div className="relative">
          <button
            type="button"
            className="text-sm text-gray-600 hover:text-purple-700"
            onClick={() => setShowMenu(!showMenu)}
          >
            {nickname || email || "用户"}
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-40 bg-white border rounded-lg shadow-lg py-1 z-10">
              <button
                type="button"
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50"
                onClick={() => {
                  setShowSettings(true);
                  setShowMenu(false);
                  setMsg("");
                }}
              >
                个人设置
              </button>
              <button
                type="button"
                className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 text-red-500"
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
      <main className="p-6">
        <Outlet />
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-white rounded-lg p-6 w-full max-w-sm shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-bold text-lg mb-4">个人设置</h2>
            {msg && <p className="text-sm text-green-600 mb-3">{msg}</p>}
            <label className="text-xs text-gray-500">昵称</label>
            <div className="flex gap-2 mb-4">
              <input
                value={newNick}
                onChange={(e) => setNewNick(e.target.value)}
                placeholder={email}
                className="border rounded px-2 py-1 text-sm flex-1"
              />
              <button
                type="button"
                className="bg-purple-600 text-white rounded px-3 py-1 text-xs"
                onClick={async () => {
                  await updateNickname(newNick);
                  setNickname(newNick);
                  setMsg("昵称已更新");
                }}
              >
                保存
              </button>
            </div>
            <label className="text-xs text-gray-500">修改密码</label>
            <input
              type="password"
              value={oldPw}
              onChange={(e) => setOldPw(e.target.value)}
              placeholder="原密码"
              className="w-full border rounded px-2 py-1 text-sm mb-2"
            />
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="新密码"
              className="w-full border rounded px-2 py-1 text-sm mb-3"
            />
            <button
              type="button"
              className="w-full bg-purple-600 text-white rounded py-1 text-sm"
              onClick={async () => {
                try {
                  await changePassword(oldPw, newPw);
                  setMsg("密码已修改");
                  setOldPw("");
                  setNewPw("");
                } catch {
                  setMsg("密码修改失败");
                }
              }}
            >
              修改密码
            </button>
            <button
              type="button"
              className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setShowSettings(false)}
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
