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
  const doneRef = useRef(false);

  useEffect(() => {
    listMessages(kbId).then((msgs) => setMessages(msgs));
  }, [kbId]);

  const send = useCallback(
    (question: string) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const aiId = nextId();
      const userMsg: Message = { id: nextId(), role: "user", content: question };
      const aiMsg: Message = { id: aiId, role: "assistant", content: "", isStreaming: true };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setIsStreaming(true);
      doneRef.current = false;

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}`;

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
            // 流式结束，附加 sources
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, isStreaming: false, sources: data.sources } : m,
              ),
            );
            setIsStreaming(false);
            doneRef.current = true;
          }
          // 如果是其他 JSON（比如未来扩展），忽略
        } catch {
          // 普通文本 token，追加到内容
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
    [kbId],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, send, clear, setMessages };
}
