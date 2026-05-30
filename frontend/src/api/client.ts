import axios from "axios";

const baseURL =
	(typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) ||
	"";
const api = axios.create({ baseURL });

// Flag to prevent multiple refresh attempts
let isRefreshing = false;
let failedQueue: Array<{
	resolve: (token: string) => void;
	reject: (error: unknown) => void;
}> = [];

const processQueue = (error: unknown, token: string | null = null) => {
	failedQueue.forEach((prom) => {
		if (error) {
			prom.reject(error);
		} else if (token) {
			prom.resolve(token);
		}
	});
	failedQueue = [];
};

// Direct refresh call (bypasses interceptors to avoid infinite loop)
async function doRefreshToken(): Promise<string> {
	const token = localStorage.getItem("token");
	if (!token) throw new Error("No token to refresh");

	const res = await axios.post(
		`${baseURL}/auth/refresh`,
		{},
		{ headers: { Authorization: `Bearer ${token}` } },
	);
	const data = res.data as { access_token: string };
	return data.access_token;
}

api.interceptors.request.use((config) => {
	const token = localStorage.getItem("token");
	if (token) config.headers.Authorization = `Bearer ${token}`;
	return config;
});

api.interceptors.response.use(
	(res) => res,
	async (err) => {
		const originalRequest = err.config;

		// If not 401 or already retried, reject
		if (err.response?.status !== 401 || originalRequest._retry) {
			// Clear token and redirect to login for 401
			if (err.response?.status === 401) {
				localStorage.removeItem("token");
				sessionStorage.setItem("login_message", "登录已过期，请重新登录");
				window.location.href = "/login";
			}
			return Promise.reject(err);
		}

		// If already refreshing, queue this request
		if (isRefreshing) {
			return new Promise((resolve, reject) => {
				failedQueue.push({ resolve, reject });
			})
				.then((token) => {
					originalRequest.headers.Authorization = `Bearer ${token}`;
					return api(originalRequest);
				})
				.catch((e) => Promise.reject(e));
		}

		isRefreshing = true;
		originalRequest._retry = true;

		try {
			const newToken = await doRefreshToken();
			localStorage.setItem("token", newToken);
			processQueue(null, newToken);

			originalRequest.headers.Authorization = `Bearer ${newToken}`;
			return api(originalRequest);
		} catch (refreshError) {
			processQueue(refreshError, null);
			localStorage.removeItem("token");
			sessionStorage.setItem("login_message", "登录已过期，请重新登录");
			window.location.href = "/login";
			return Promise.reject(refreshError);
		} finally {
			isRefreshing = false;
		}
	},
);

export default api;
