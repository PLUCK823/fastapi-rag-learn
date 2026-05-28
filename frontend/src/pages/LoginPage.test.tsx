import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import LoginPage from "./LoginPage";

const server = setupServer(
  http.post("/auth/login", () =>
    HttpResponse.json({ access_token: "fake-token", token_type: "bearer" }),
  ),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("LoginPage", () => {
  it("renders login form", () => {
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText("邮箱")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("密码")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "登录" })).toBeInTheDocument();
  });

  it("shows error on failed login", async () => {
    server.use(http.post("/auth/login", () => new HttpResponse(null, { status: 400 })));
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByPlaceholderText("邮箱"), "a@b.com");
    await userEvent.type(screen.getByPlaceholderText("密码"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "登录" }));
    expect(await screen.findByText("登录失败，请检查邮箱和密码")).toBeInTheDocument();
  });
});
