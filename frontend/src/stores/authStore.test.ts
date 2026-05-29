import { describe, expect, it } from "vitest";
import { useAuthStore } from "./authStore";

describe("authStore", () => {
  it("setToken stores token in localStorage", () => {
    const { setToken } = useAuthStore.getState();
    setToken("my-token-123");
    expect(localStorage.getItem("token")).toBe("my-token-123");
    expect(useAuthStore.getState().token).toBe("my-token-123");
    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });

  it("logout clears token", () => {
    localStorage.setItem("token", "existing");
    useAuthStore.setState({ token: "existing" });
    const { logout } = useAuthStore.getState();
    logout();
    expect(localStorage.getItem("token")).toBeNull();
    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it("isAuthenticated returns false when no token", () => {
    useAuthStore.setState({ token: null });
    localStorage.clear();
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });
});
