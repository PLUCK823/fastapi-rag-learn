import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import ChatMessage from "./ChatMessage";

describe("ChatMessage", () => {
  it("renders user message", () => {
    const msg: Message = {
      id: "1",
      role: "user",
      content: "什么是 RAG？",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("什么是 RAG？")).toBeInTheDocument();
    // User message is right-aligned: text → div.content → div.bubble → div.flex(justify-end)
    const textEl = screen.getByText("什么是 RAG？");
    const bubble = textEl.parentElement;
    const flexContainer = bubble?.parentElement;
    expect(flexContainer?.className).toContain("justify-end");
  });

  it("renders assistant message", () => {
    const msg: Message = {
      id: "2",
      role: "assistant",
      content: "RAG 是检索增强生成。",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("RAG 是检索增强生成。")).toBeInTheDocument();
    // Assistant message is left-aligned
    const textEl = screen.getByText("RAG 是检索增强生成。");
    const bubble = textEl.parentElement;
    const flexContainer = bubble?.parentElement;
    expect(flexContainer?.className).toContain("justify-start");
  });

  it("shows blinking cursor when streaming and empty", () => {
    const msg: Message = {
      id: "3",
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    render(<ChatMessage msg={msg} />);
    const el = screen.getByText("▊");
    expect(el.className).toContain("animate-pulse-soft");
  });

  it("renders sources when present", () => {
    const msg: Message = {
      id: "4",
      role: "assistant",
      content: "Answer",
      sources: [
        { index: 1, document_id: 1, document_name: "readme.md", snippet: "..." },
        { index: 2, document_id: 2, document_name: "notes.txt", snippet: "..." },
      ],
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText(/readme\.md/)).toBeInTheDocument();
    expect(screen.getByText(/notes\.txt/)).toBeInTheDocument();
  });
});
