import { createBrowserRouter, Link, Navigate } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import ChatPage from "../pages/ChatPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import KBListPage from "../pages/KBListPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem("token")) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  { path: "/forgot-password", element: <ForgotPasswordPage /> },
  { path: "/reset-password", element: <ResetPasswordPage /> },
  {
    path: "/",
    element: (
      <AuthGuard>
        <AppLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <KBListPage /> },
      { path: "chat/:kbId", element: <ChatPage /> },
    ],
  },
  {
    path: "*",
    element: (
      <div
        className="flex flex-col items-center justify-center min-h-screen gap-4"
        style={{ color: "var(--text-primary)", backgroundColor: "var(--bg-primary)" }}
      >
        <h1 className="display-text text-3xl font-bold">页面未找到</h1>
        <p style={{ color: "var(--text-secondary)" }}>你访问的页面不存在</p>
        <Link
          to="/"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: "var(--color-ink)", color: "var(--color-cream)" }}
        >
          返回首页
        </Link>
      </div>
    ),
  },
]);
