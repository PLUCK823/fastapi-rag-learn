import { useCallback, useEffect, useRef, useState } from "react";
import { listSessionMessages } from "../api/kb";
import { toast } from "../stores/toastStore";
import type { Message } from "../types";
import { getErrorMessage } from "../utils/error";

let _msgId = 0;
function nextId(): string {
  _msgId += 1;
  return `msg_${_msgId}_${Date.now()}`;
}

/**
 * Buffer Queue typewriter pattern:
 * - Tokens arrive at WebSocket speed → accumulated in buffer (no re-render)
 * - setInterval at ~30fps flushes buffer to React state (normal setState, no flushSync)
 * - Browser has ~30ms between ticks for scroll/click/paint — never blocks main thread
 * - Streaming renders as plain text; completion switches to ReactMarkdown once
 */

const TICK_MS = 35; // ~30fps — smooth enough, non-blocking

export function useChatWS(kbId: number, sessionId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const doneRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const shouldLoadMessages = useRef(true);

  const bufferRef = useRef("");
  const lastLenRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const aiIdRef = useRef("");

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    if (sessionId && shouldLoadMessages.current) {
      listSessionMessages(kbId, sessionId)
        .then(setMessages)
        .catch((err) => toast(getErrorMessage(err)));
    } else if (!sessionId) {
      setMessages([]);
    }
  }, [kbId, sessionId]);

  const prepareSend = useCallback(() => {
    shouldLoadMessages.current = false;
  }, []);
  const resetLoadFlag = useCallback(() => {
    shouldLoadMessages.current = true;
  }, []);

  const _startStream = useCallback(
    (aiId: string, question: string, token: string, sid: string) => {
      setIsStreaming(true);
      doneRef.current = false;
      bufferRef.current = "";
      lastLenRef.current = 0;
      aiIdRef.current = aiId;

      if (intervalRef.current) clearInterval(intervalRef.current);

      // 30fps flush: read buffer, update state only if content grew
      intervalRef.current = setInterval(() => {
        if (doneRef.current) return;
        const cur = bufferRef.current;
        if (cur.length === lastLenRef.current) return;
        lastLenRef.current = cur.length;
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, content: cur, isStreaming: true } : m)),
        );
      }, TICK_MS);

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}&session_id=${sid}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => ws.send(question);

      ws.onmessage = (e) => {
        if (doneRef.current) return;
        if (typeof e.data === "string" && e.data.startsWith("{")) {
          try {
            const data = JSON.parse(e.data);
            if (data.error) {
              doneRef.current = true;
              if (intervalRef.current) clearInterval(intervalRef.current);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId
                    ? { ...m, content: `[错误: ${data.error}]`, isStreaming: false }
                    : m,
                ),
              );
              setIsStreaming(false);
            } else if (data.done) {
              doneRef.current = true;
              if (intervalRef.current) clearInterval(intervalRef.current);
              const content = bufferRef.current;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId ? { ...m, content, isStreaming: false, sources: data.sources } : m,
                ),
              );
              setIsStreaming(false);
            }
          } catch {
            /* not JSON — append as text below */
          }
        } else {
          bufferRef.current += e.data;
        }
      };

      ws.onclose = () => {
        doneRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId ? { ...m, content: bufferRef.current, isStreaming: false } : m,
          ),
        );
        setIsStreaming(false);
      };

      ws.onerror = () => {
        doneRef.current = true;
        if (intervalRef.current) clearInterval(intervalRef.current);
        const content = bufferRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? { ...m, content: content || "[错误: 连接失败]", isStreaming: false }
              : m,
          ),
        );
        setIsStreaming(false);
      };
    },
    [kbId],
  );

  const send = useCallback(
    (question: string, overrideSessionId?: string) => {
      const token = localStorage.getItem("token");
      const sid = overrideSessionId ?? sessionIdRef.current;
      if (!token || !sid) return;
      const aiId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", content: question },
        { id: aiId, role: "assistant", content: "", isStreaming: true },
      ]);
      _startStream(aiId, question, token, sid);
    },
    [_startStream],
  );

  const resend = useCallback(
    (question: string) => {
      const token = localStorage.getItem("token");
      const sid = sessionIdRef.current;
      if (!token || !sid) return;
      const aiId = nextId();
      setMessages((prev) => [
        ...prev,
        { id: aiId, role: "assistant", content: "", isStreaming: true },
      ]);
      _startStream(aiId, question, token, sid);
    },
    [_startStream],
  );

  const clear = useCallback(() => setMessages([]), []);
  const truncateAt = useCallback((index: number) => {
    setMessages((prev) => prev.slice(0, index));
  }, []);

  return {
    messages,
    isStreaming,
    send,
    resend,
    clear,
    setMessages,
    truncateAt,
    prepareSend,
    resetLoadFlag,
  };
}
