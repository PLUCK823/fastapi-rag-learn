import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { useChatWS } from "./useChat";

const server = setupServer(
  http.get("/kb/:kbId/messages", () =>
    HttpResponse.json([{ id: 1, role: "user", content: "hello", created_at: "2025-01-01" }]),
  ),
);

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  localStorage.clear();
});
afterAll(() => server.close());

describe("useChatWS", () => {
  it("loads message history on mount", async () => {
    localStorage.setItem("token", "fake");
    const { result } = renderHook(() => useChatWS(1));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });
    expect(result.current.messages[0].role).toBe("user");
    expect(result.current.messages[0].content).toBe("hello");
    expect(result.current.isStreaming).toBe(false);
  });

  it("clear resets messages", async () => {
    localStorage.setItem("token", "fake");
    const { result } = renderHook(() => useChatWS(1));

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(1);
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.messages).toHaveLength(0);
  });

  it("send requires token", async () => {
    localStorage.removeItem("token");
    const { result } = renderHook(() => useChatWS(1));

    act(() => {
      result.current.send("test question");
    });

    // No messages should be added without a token
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(0);
    });
  });
});
