import { useCallback, useRef, useState } from "react";

export function useChatWS(kbId: number) {
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const send = useCallback(
    (question: string) => {
      const token = localStorage.getItem("token");
      if (!token) return;

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;
      setIsStreaming(true);
      setStreamingText("");

      ws.onopen = () => ws.send(question);
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            setStreamingText((prev) => `${prev}[错误: ${data.error}]`);
            setIsStreaming(false);
          }
        } catch {
          setStreamingText((prev) => prev + e.data);
        }
      };
      ws.onclose = () => setIsStreaming(false);
      ws.onerror = () => {
        setStreamingText((prev) => `${prev}\n[连接错误]`);
        setIsStreaming(false);
      };
    },
    [kbId],
  );

  const stop = useCallback(() => {
    wsRef.current?.close();
    setIsStreaming(false);
  }, []);

  return { streamingText, isStreaming, send, stop, setStreamingText };
}
