import axios from "axios";

/** Strip Pydantic v2 "Value error, " prefix for cleaner validation messages */
function cleanDetail(msg: string): string {
  return msg.replace(/^Value error,\s*/i, "");
}

/** Map fastapi-users raw error codes to user-friendly Chinese messages */
const ERROR_CODE_MAP: Record<string, string> = {
  LOGIN_BAD_CREDENTIALS: "邮箱或密码错误",
  LOGIN_USER_NOT_VERIFIED: "账号尚未验证，请检查邮箱",
  REGISTER_INVALID_PASSWORD: "密码格式不符合要求",
  REGISTER_USER_ALREADY_EXISTS: "该邮箱已被注册",
  RESET_PASSWORD_BAD_TOKEN: "密码重置链接已失效",
  RESET_PASSWORD_INVALID_PASSWORD: "新密码格式不符合要求",
  VERIFY_USER_BAD_TOKEN: "验证链接已失效",
  VERIFY_USER_ALREADY_VERIFIED: "账号已验证，无需重复验证",
  UPDATE_USER_EMAIL_ALREADY_EXISTS: "该邮箱已被其他账号使用",
  UPDATE_USER_INVALID_PASSWORD: "当前密码不正确",
};

/** Extract a user-friendly message from any error thrown by an API call */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    // Backend FastAPI errors come as { detail: "..." }
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") {
      const cleaned = cleanDetail(detail);
      // Map raw fastapi-users error codes to Chinese messages
      if (cleaned in ERROR_CODE_MAP) return ERROR_CODE_MAP[cleaned];
      return cleaned;
    }
    // FastAPI validation errors come as { detail: [{ msg: "..." }] }
    if (Array.isArray(detail) && detail.length > 0 && detail[0]?.msg) {
      return cleanDetail(detail[0].msg);
    }
    if (err.response?.status === 401) return "登录已过期，请重新登录";
    if (err.response?.status === 403) return "无权执行此操作";
    if (err.response?.status === 404) return "请求的资源不存在";
    if (err.response?.status === 429) return "请求过于频繁，请稍后再试";
    if (err.response && err.response.status >= 500) return "服务器错误，请稍后再试";
    if (err.code === "ERR_NETWORK") return "网络连接失败，请检查网络";
    if (err.code === "ECONNABORTED") return "请求超时，请检查网络后重试";
  }
  if (err instanceof Error) return err.message;
  return "操作失败，请稍后重试";
}
