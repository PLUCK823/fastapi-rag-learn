import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import KBListPage from "./KBListPage";

const server = setupServer(
  http.get("/kb", () =>
    HttpResponse.json([{ id: 1, name: "我的知识库", document_count: 3, created_at: "2025-01-01" }]),
  ),
  http.post("/kb", async ({ request }) => {
    const body = (await request.json()) as { name: string };
    return HttpResponse.json({
      id: 2,
      name: body.name,
      document_count: 0,
      created_at: "2025-06-01",
    });
  }),
  http.delete("/kb/:id", () => HttpResponse.json({ message: "ok", deleted_document_count: 0 })),
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
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
});
