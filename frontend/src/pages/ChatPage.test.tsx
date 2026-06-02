import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import ChatPage from "./ChatPage";

// Track document state for dynamic responses
let docState = [
  {
    id: 1,
    filename: "readme.md",
    chunk_count: 5,
    status: "ready",
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
  },
];
let sessionState = [
  {
    session_id: "sess_1",
    first_question: "测试问题",
    message_count: 2,
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
  },
];

const server = setupServer(
  http.get("/kb", () =>
    HttpResponse.json({
      items: [
        {
          id: 1,
          name: "测试知识库",
          document_count: docState.length,
          created_at: "2025-01-01",
          documents: docState,
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    }),
  ),
  http.get("/kb/1/sessions", () => HttpResponse.json(sessionState)),
  http.get("/kb/1/sessions/:sid/messages", () =>
    HttpResponse.json([
      { id: "1", role: "user", content: "测试问题", created_at: "2025-01-01" },
      { id: "2", role: "assistant", content: "测试回答", created_at: "2025-01-01" },
    ]),
  ),
  http.get("/kb/1/docs/1/content", () => HttpResponse.json({ content: "文档内容" })),
  http.delete("/kb/1/docs/:docId", ({ params }) => {
    docState = docState.filter((d) => d.id !== Number(params.docId));
    return HttpResponse.json({ message: "ok" });
  }),
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
  docState = [
    {
      id: 1,
      filename: "readme.md",
      chunk_count: 5,
      status: "ready",
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    },
  ];
  sessionState = [
    {
      session_id: "sess_1",
      first_question: "测试问题",
      message_count: 2,
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    },
  ];
});
afterAll(() => server.close());

describe("ChatPage", () => {
  beforeEach(() => {
    localStorage.setItem("token", "fake");
  });

  it("renders KB name and doc count", async () => {
    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText("测试知识库")).toBeInTheDocument();
    // Doc count shown in doc management button
    expect(await screen.findByText("(1 篇)")).toBeInTheDocument();
  });

  it("opens doc management modal and shows documents", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("测试知识库");

    // Click doc management button
    await user.click(screen.getByText(/文档管理/));
    // Doc should appear in modal
    expect(await screen.findByText("readme.md")).toBeInTheDocument();
  });

  it("renders sessions list", async () => {
    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("测试知识库");
    const sessionElements = screen.getAllByText("测试问题");
    expect(sessionElements.length).toBeGreaterThan(0);
  });

  it("can create new session", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("测试知识库");

    // "+ 新建" in sessions section (second one; first is for document)
    const newSessionButtons = screen.getAllByRole("button", { name: "+ 新建" });
    await user.click(newSessionButtons[1]);
    await waitFor(() => {
      const newSessionElements = screen.getAllByText("新的对话");
      expect(newSessionElements.length).toBeGreaterThan(0);
    });
  });

  it("filters out non-ready docs from stats", async () => {
    // Add a processing document
    docState.push({
      id: 2,
      filename: "processing.md",
      chunk_count: 0,
      status: "processing",
      created_at: "2025-01-01",
      updated_at: "2025-01-01",
    });
    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText("测试知识库");
    // Should still show (1 篇), not (2 篇)
    expect(await screen.findByText("(1 篇)")).toBeInTheDocument();
  });
});
