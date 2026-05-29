import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import KBListPage from "./KBListPage";

// Track KB state for dynamic responses
let kbState = [{ id: 1, name: "我的知识库", document_count: 3, created_at: "2025-01-01" }];

const server = setupServer(
  http.get("/kb", () => HttpResponse.json(kbState)),
  http.post("/kb", async ({ request }) => {
    const body = (await request.json()) as { name: string };
    const newKb = {
      id: 2,
      name: body.name,
      document_count: 0,
      created_at: "2025-06-01",
    };
    kbState = [...kbState, newKb];
    return HttpResponse.json(newKb);
  }),
  http.delete("/kb/:id", ({ params }) => {
    kbState = kbState.filter((kb) => kb.id !== Number(params.id));
    return HttpResponse.json({ message: "ok", deleted_document_count: 0 });
  }),
  http.put("/kb/:id", async ({ request, params }) => {
    const body = (await request.json()) as { name: string };
    kbState = kbState.map((kb) =>
      kb.id === Number(params.id) ? { ...kb, name: body.name } : kb
    );
    return HttpResponse.json({
      id: Number(params.id),
      name: body.name,
      document_count: 3,
      created_at: "2025-01-01",
    });
  }),
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  // Reset KB state
  kbState = [{ id: 1, name: "我的知识库", document_count: 3, created_at: "2025-01-01" }];
});
afterAll(() => server.close());

describe("KBListPage", () => {
  it("renders knowledge base list", async () => {
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("3 篇文档")).toBeInTheDocument();
  });

  it("shows empty state when no KBs", async () => {
    server.use(http.get("/kb", () => HttpResponse.json([])));
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByText("暂无知识库")).toBeInTheDocument();
  });

  it("renders input and create button", () => {
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    expect(screen.getByPlaceholderText("输入知识库名称…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建" })).toBeInTheDocument();
  });

  it("can type in the input and click create", async () => {
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    const input = screen.getByPlaceholderText("输入知识库名称…");
    expect(input).toBeInTheDocument();
    await userEvent.type(input, "新知识库");
    await userEvent.click(screen.getByRole("button", { name: "创建" }));
    // After creation, the list refreshes — KB card appears
    expect(await screen.findByText("3 篇文档")).toBeInTheDocument();
  });

  it("shows edit button for each KB", async () => {
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole("button", { name: "编辑" })).toBeInTheDocument();
  });

  it("clicking edit shows inline input", async () => {
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    await screen.findByText("我的知识库");
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    // Should show an input with the current name
    const input = screen.getByDisplayValue("我的知识库");
    expect(input).toBeInTheDocument();
  });

  it("pressing Enter in edit mode saves the new name", async () => {
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    await screen.findByText("我的知识库");
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    const input = screen.getByDisplayValue("我的知识库");
    await userEvent.clear(input);
    await userEvent.type(input, "新名称{enter}");
    // After rename, the list refreshes with new name - wait for it
    await screen.findByRole("link", { name: "新名称" });
  });

  it("pressing Escape in edit mode cancels editing", async () => {
    localStorage.setItem("token", "fake");
    render(
      <MemoryRouter>
        <KBListPage />
      </MemoryRouter>,
    );
    await screen.findByRole("link", { name: "我的知识库" });
    await userEvent.click(screen.getByRole("button", { name: "编辑" }));
    const input = screen.getByDisplayValue("我的知识库");
    await userEvent.clear(input);
    await userEvent.type(input, "取消的名称{escape}");
    // Should revert to original name - use link role to avoid header text
    expect(screen.getByRole("link", { name: "我的知识库" })).toBeInTheDocument();
    expect(screen.queryByDisplayValue("取消的名称")).not.toBeInTheDocument();
  });
});
