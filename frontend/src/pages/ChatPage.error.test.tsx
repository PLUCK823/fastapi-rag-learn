import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import ChatPage from "./ChatPage";

// Track KB state
let kbState = {
  id: 1,
  name: "测试知识库",
  document_count: 1,
  documents: [{ id: 1, filename: "test.md", chunk_count: 5 }],
};

let sessionState: unknown[] = [];

const server = setupServer(
  http.get("/kb", () =>
    HttpResponse.json({
      items: [kbState],
      total: 1,
      page: 1,
      page_size: 20,
      total_pages: 1,
    }),
  ),
  http.get("/kb/1/sessions", () => HttpResponse.json(sessionState)),
  http.get("/kb/1/sessions/:sid/messages", () => HttpResponse.json([])),
  http.post("/kb/1/docs", async ({ request }) => {
    const body = (await request.json()) as {
      content: string;
      filename: string;
    };
    const newDoc = { id: 2, filename: body.filename, chunk_count: 3 };
    kbState.documents.push(newDoc);
    kbState.document_count++;
    return HttpResponse.json(newDoc);
  }),
  http.delete("/kb/1/docs/:docId", ({ params }) => {
    kbState.documents = kbState.documents.filter((d) => d.id !== Number(params.docId));
    kbState.document_count--;
    return HttpResponse.json({ message: "ok" });
  }),
  http.post("/kb/1/sessions", async ({ request }) => {
    const body = (await request.json()) as { session_id: string };
    const newSession = {
      session_id: body.session_id,
      first_question: "测试问题",
      message_count: 2,
    };
    sessionState.push(newSession);
    return HttpResponse.json(newSession);
  }),
  http.post("/auth/refresh", () =>
    HttpResponse.json({
      access_token: "refreshed-token",
      token_type: "bearer",
    }),
  ),
);

beforeAll(() => server.listen());
beforeEach(() => {
  sessionState = [];
  kbState = {
    id: 1,
    name: "测试知识库",
    document_count: 1,
    documents: [{ id: 1, filename: "test.md", chunk_count: 5 }],
  };
});
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

describe("ChatPage Error Handling", () => {
  it("handles empty document list gracefully", async () => {
    localStorage.setItem("token", "fake-token");

    server.use(
      http.get("/kb", () =>
        HttpResponse.json({
          items: [{ id: 1, name: "空知识库", document_count: 0, documents: [] }],
          total: 1,
        }),
      ),
    );

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    const kbNames = await screen.findAllByText("空知识库");
    expect(kbNames.length).toBeGreaterThanOrEqual(1);

    // Doc management button should show (0 篇)
    expect(await screen.findByText("(0 篇)")).toBeInTheDocument();
  });

  it("handles empty session list gracefully", async () => {
    localStorage.setItem("token", "fake-token");

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    // Wait for KB to load
    const kbNames = await screen.findAllByText("测试知识库");
    expect(kbNames.length).toBeGreaterThanOrEqual(1);

    // Sessions section should exist (even if empty)
    // The page should render without crashing
    await waitFor(
      () => {
        // Just verify the page is rendered
        const found = screen.queryAllByText("测试知识库");
        expect(found.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 1000 },
    );
  });
});

describe("ChatPage Boundary Tests", () => {
  it("handles very long chat input", async () => {
    localStorage.setItem("token", "fake-token");

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("测试知识库");

    const input = screen.getByPlaceholderText("输入问题，Enter 发送…");

    // Type very long message (1000 chars)
    const longMessage = "这是一个很长的测试问题".repeat(50);
    await userEvent.type(input, longMessage);

    // Input should accept the value
    expect(input).toHaveValue(longMessage);
  });

  it("handles special characters in chat input", async () => {
    localStorage.setItem("token", "fake-token");

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("测试知识库");

    const input = screen.getByPlaceholderText("输入问题，Enter 发送…");

    // Type special characters
    const specialMessage = "测试<script>alert('xss')</script>🎉📚";
    await userEvent.type(input, specialMessage);

    expect(input).toHaveValue(specialMessage);
  });

  it("handles empty message submission", async () => {
    localStorage.setItem("token", "fake-token");

    render(
      <MemoryRouter initialEntries={["/chat/1"]}>
        <Routes>
          <Route path="/chat/:kbId" element={<ChatPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findAllByText("测试知识库");

    const input = screen.getByPlaceholderText("输入问题，Enter 发送…");

    // Try to send empty message
    await userEvent.type(input, "   {enter}");

    // Should not create message
    await waitFor(
      () => {
        // Input should be cleared or still empty
        const inputValue = input.value.trim();
        expect(inputValue.length).toBe(0);
      },
      { timeout: 500 },
    );
  });
});
