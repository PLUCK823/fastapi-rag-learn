import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import LoginPage from "./LoginPage";

// Mock toast — the component now uses toast() instead of inline error display
vi.mock("../stores/toastStore", () => ({
  toast: vi.fn(),
}));

const server = setupServer(
  http.post("/auth/login", () =>
    HttpResponse.json({ access_token: "fake-token", token_type: "bearer" }),
  ),
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

describe("LoginPage", () => {
  it("renders login form", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("calls toast on failed login", async () => {
    const { toast } = await import("../stores/toastStore");
    server.use(
      http.post("/auth/login", () =>
        HttpResponse.json({ detail: "邮箱或密码不正确" }, { status: 400 }),
      ),
    );
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText("name@example.com"), "a@b.com");
    await userEvent.type(screen.getByPlaceholderText("••••••••"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "登录" }));
    // Wait for async error to be caught and toast to be called
    await vi.waitFor(() => {
      expect(toast).toHaveBeenCalledWith("邮箱或密码不正确", "error");
    });
  });

  it("has registration link", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("注册")).toBeInTheDocument();
  });
});
