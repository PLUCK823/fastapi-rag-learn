import { create } from "zustand";

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
}));
