import { create } from "zustand";

import { refreshToken } from "../api/auth";

const storage = {
	get: (k: string): string | null => {
		try {
			return localStorage.getItem(k);
		} catch {
			return null;
		}
	},
	set: (k: string, v: string) => {
		try {
			localStorage.setItem(k, v);
		} catch {
			/* noop */
		}
	},
	remove: (k: string) => {
		try {
			localStorage.removeItem(k);
		} catch {
			/* noop */
		}
	},
};

interface AuthState {
	token: string | null;
	setToken: (t: string) => void;
	logout: () => void;
	isAuthenticated: () => boolean;
	refresh: () => Promise<boolean>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
	token: storage.get("token"),
	setToken: (t) => {
		storage.set("token", t);
		set({ token: t });
	},
	logout: () => {
		storage.remove("token");
		set({ token: null });
	},
	isAuthenticated: () => !!get().token,
	refresh: async () => {
		const currentToken = get().token;
		if (!currentToken) return false;

		try {
			const data = await refreshToken();
			storage.set("token", data.access_token);
			set({ token: data.access_token });
			return true;
		} catch {
			// Refresh failed, logout
			get().logout();
			return false;
		}
	},
}));
