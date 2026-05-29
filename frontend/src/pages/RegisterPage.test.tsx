import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import RegisterPage from "./RegisterPage";

const server = setupServer(
  http.post("/auth/register", () =>
    HttpResponse.json({ id: 1, email: "new@test.com" }, { status: 201 }),
  ),
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

describe("RegisterPage", () => {
  it("renders register form", () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText("name@example.com")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("至少 6 个字符")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "注册并登录" })).toBeInTheDocument();
  });

  it("shows link to login", () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("登录")).toBeInTheDocument();
  });

  it("handles registration and redirects", async () => {
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText("name@example.com"), "new@test.com");
    await userEvent.type(screen.getByPlaceholderText("至少 6 个字符"), "pass123456");
    await userEvent.click(screen.getByRole("button", { name: "注册并登录" }));
    expect(localStorage.getItem("token")).toBe("fake-token");
  });
});
