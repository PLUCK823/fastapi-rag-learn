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
  const streamBuf = useRef("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    listMessages(kbId).then((msgs) => setMessages(msgs));
  }, [kbId]);

  const flushStream = useCallback((aiId: string) => {
    const text = streamBuf.current;
    streamBuf.current = "";
    setMessages((prev) =>
      prev.map((m) => (m.id === aiId ? { ...m, content: m.content + text } : m)),
    );
  }, []);

  const send = useCallback(
    (question: string) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const aiId = nextId();
      const userMsg: Message = { id: nextId(), role: "user", content: question };
      const aiMsg: Message = { id: aiId, role: "assistant", content: "", isStreaming: true };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setIsStreaming(true);
      streamBuf.current = "";

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      // Flush buffer every 30ms for smooth typewriter effect
      timerRef.current = setInterval(() => {
        if (streamBuf.current) flushStream(aiId);
      }, 30);

      ws.onopen = () => ws.send(question);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            streamBuf.current += `[错误: ${data.error}]`;
            flushStream(aiId);
            setIsStreaming(false);
          }
        } catch {
          streamBuf.current += e.data;
        }
      };
      ws.onclose = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        flushStream(aiId);
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, isStreaming: false } : m)));
        setIsStreaming(false);
      };
      ws.onerror = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        flushStream(aiId);
        setIsStreaming(false);
      };
    },
    [kbId, flushStream],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, send, clear, setMessages };
}
