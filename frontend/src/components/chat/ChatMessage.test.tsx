import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Message } from "../../types";
import ChatMessage from "./ChatMessage";

describe("ChatMessage", () => {
  it("renders user message with purple background", () => {
    const msg: Message = {
      id: "1",
      role: "user",
      content: "什么是 RAG？",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("什么是 RAG？")).toBeInTheDocument();
    // User message is right-aligned
    const container = screen.getByText("什么是 RAG？").closest("div");
    expect(container?.className).toContain("bg-purple");
  });

  it("renders assistant message", () => {
    const msg: Message = {
      id: "2",
      role: "assistant",
      content: "RAG 是检索增强生成。",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("RAG 是检索增强生成。")).toBeInTheDocument();
  });

  it("shows blinking cursor when streaming and empty", () => {
    const msg: Message = {
      id: "3",
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    render(<ChatMessage msg={msg} />);
    // Should show a pulsing block
    const el = screen.getByText("▊");
    expect(el.className).toContain("animate-pulse");
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
    expect(screen.getByText("[1] readme.md")).toBeInTheDocument();
    expect(screen.getByText("[2] notes.txt")).toBeInTheDocument();
  });
});
