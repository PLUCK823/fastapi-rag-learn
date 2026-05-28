import { create } from "zustand";

interface AuthState {
  token: string | null;
  setToken: (t: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: localStorage.getItem("token"),
  setToken: (t) => {
    localStorage.setItem("token", t);
    set({ token: t });
  },
  logout: () => {
    localStorage.removeItem("token");
    set({ token: null });
  },
  isAuthenticated: () => !!get().token,
}));
