import { createBrowserRouter, Navigate } from "react-router-dom";
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
]);
