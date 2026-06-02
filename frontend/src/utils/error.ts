import axios from "axios";

/** Strip Pydantic v2 "Value error, " prefix for cleaner validation messages */
function cleanDetail(msg: string): string {
  return msg.replace(/^Value error,\s*/i, "");
}

/** Extract a user-friendly message from any error thrown by an API call */
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    // Backend FastAPI errors come as { detail: "..." }
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return cleanDetail(detail);
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
