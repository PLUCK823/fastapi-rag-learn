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
    // User message is right-aligned: text → div.bubble → div.flex-col(items-end) → div.flex(justify-end)
    const textEl = screen.getByText("什么是 RAG？");
    const bubble = textEl.parentElement;       // .rounded-2xl
    const column = bubble?.parentElement;       // .flex-col items-end
    const flexContainer = column?.parentElement; // .chat-message.flex justify-end
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
    // Assistant message is left-aligned: text → div.bubble → div.flex-col(items-start) → div.flex(justify-start)
    const textEl = screen.getByText("RAG 是检索增强生成。");
    const bubble = textEl.parentElement;       // .rounded-2xl
    const column = bubble?.parentElement;       // .flex-col items-start
    const flexContainer = column?.parentElement; // .chat-message.flex justify-start
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

  it("renders markdown code blocks in assistant message", () => {
    const msg: Message = {
      id: "5",
      role: "assistant",
      content: "```python\nprint('hello')\n```",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText(/print\('hello'\)/)).toBeInTheDocument();
  });

  it("renders inline code in assistant message", () => {
    const msg: Message = {
      id: "6",
      role: "assistant",
      content: "使用 `pip install` 安装",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("pip install")).toBeInTheDocument();
  });

  it("renders markdown lists in assistant message", () => {
    const msg: Message = {
      id: "7",
      role: "assistant",
      content: "- 项目一\n- 项目二\n",
    };
    render(<ChatMessage msg={msg} />);
    expect(screen.getByText("项目一")).toBeInTheDocument();
    expect(screen.getByText("项目二")).toBeInTheDocument();
  });

  it("renders markdown links in assistant message", () => {
    const msg: Message = {
      id: "8",
      role: "assistant",
      content: "查看 [文档](https://example.com) 了解更多",
    };
    render(<ChatMessage msg={msg} />);
    const link = screen.getByRole("link", { name: "文档" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders user message as plain text (no markdown)", () => {
    const msg: Message = {
      id: "9",
      role: "user",
      content: "```python\nprint('hello')\n```",
    };
    render(<ChatMessage msg={msg} />);
    // User message should show the raw text including backticks
    expect(screen.getByText(/```python/)).toBeInTheDocument();
  });
});
