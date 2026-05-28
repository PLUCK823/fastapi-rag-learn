import { useCallback, useEffect, useRef, useState } from "react";
import { listMessages } from "../api/kb";
import type { Message } from "../types";

let _msgId = 0;
function nextId(): string {
  _msgId += 1;
  return `msg_${_msgId}_${Date.now()}`;
}

export function useChatWS(kbId: number) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    listMessages(kbId).then((msgs) => setMessages(msgs));
  }, [kbId]);

  const send = useCallback(
    (question: string) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const userMsg: Message = { id: nextId(), role: "user", content: question };
      const aiMsg: Message = { id: nextId(), role: "assistant", content: "", isStreaming: true };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setIsStreaming(true);

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => ws.send(question);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            setMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1 && m.role === "assistant"
                  ? { ...m, content: `${m.content}[错误: ${data.error}]`, isStreaming: false }
                  : m,
              ),
            );
            setIsStreaming(false);
          }
        } catch {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1 && m.role === "assistant"
                ? { ...m, content: m.content + e.data }
                : m,
            ),
          );
        }
      };
      ws.onclose = () => {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1 && m.role === "assistant" ? { ...m, isStreaming: false } : m,
          ),
        );
        setIsStreaming(false);
      };
      ws.onerror = () => setIsStreaming(false);
    },
    [kbId],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, send, clear, setMessages };
}
