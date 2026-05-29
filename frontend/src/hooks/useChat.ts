import { useCallback, useEffect, useRef, useState } from "react";
import { listSessionMessages } from "../api/kb";
import type { Message } from "../types";

let _msgId = 0;
function nextId(): string {
  _msgId += 1;
  return `msg_${_msgId}_${Date.now()}`;
}

export function useChatWS(kbId: number, sessionId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const doneRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const shouldLoadMessages = useRef(true); // Prevent reload during send

  // Keep ref in sync with prop
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  // Load session messages when sessionId changes
  useEffect(() => {
    if (sessionId && shouldLoadMessages.current) {
      listSessionMessages(kbId, sessionId).then(setMessages);
    } else if (!sessionId) {
      setMessages([]);
    }
    // Reset flag after effect runs
    shouldLoadMessages.current = true;
  }, [kbId, sessionId]);

  const send = useCallback(
    (question: string, overrideSessionId?: string) => {
      const token = localStorage.getItem("token");
      // Use override if provided, otherwise use current ref value
      const sid = overrideSessionId ?? sessionIdRef.current;
      if (!token || !sid) return;

      // Prevent useEffect from reloading messages when sessionId changes
      shouldLoadMessages.current = false;

      const aiId = nextId();
      const userMsg: Message = { id: nextId(), role: "user", content: question };
      const aiMsg: Message = { id: aiId, role: "assistant", content: "", isStreaming: true };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setIsStreaming(true);
      doneRef.current = false;

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}&session_id=${sid}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => ws.send(question);
      ws.onmessage = (e) => {
        if (doneRef.current) return;
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, content: `[错误: ${data.error}]`, isStreaming: false } : m,
              ),
            );
            setIsStreaming(false);
            doneRef.current = true;
          } else if (data.done) {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, isStreaming: false, sources: data.sources } : m,
              ),
            );
            setIsStreaming(false);
            doneRef.current = true;
          }
        } catch {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: m.content + e.data } : m)),
          );
        }
      };
      ws.onclose = () => {
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, isStreaming: false } : m)));
        setIsStreaming(false);
        doneRef.current = true;
      };
      ws.onerror = () => {
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, isStreaming: false } : m)));
        setIsStreaming(false);
        doneRef.current = true;
      };
    },
    [kbId, sessionId],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, send, clear, setMessages };
}
