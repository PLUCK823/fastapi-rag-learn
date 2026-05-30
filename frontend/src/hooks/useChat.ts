import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { listSessionMessages } from "../api/kb";
import { toast } from "../stores/toastStore";
import type { Message } from "../types";
import { getErrorMessage } from "../utils/error";

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
  const shouldLoadMessages = useRef(true);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (sessionId && shouldLoadMessages.current) {
      listSessionMessages(kbId, sessionId)
        .then(setMessages)
        .catch((err) => toast(getErrorMessage(err)));
    } else if (!sessionId) setMessages([]);
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
              flushSync(() => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiId
                      ? { ...m, content: `[错误: ${data.error}]`, isStreaming: false }
                      : m,
                  ),
                );
                setIsStreaming(false);
              });
            } else if (data.done) {
              doneRef.current = true;
              flushSync(() => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === aiId ? { ...m, isStreaming: false, sources: data.sources } : m,
                  ),
                );
                setIsStreaming(false);
              });
            }
          } catch {
            /* ignore - not JSON */
          }
        } else {
          // Token: append immediately with flushSync for frame-level visibility
          flushSync(() => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, content: m.content + e.data, isStreaming: true } : m,
              ),
            );
          });
        }
      };

      ws.onclose = () => {
        doneRef.current = true;
        flushSync(() => {
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, isStreaming: false } : m)),
          );
          setIsStreaming(false);
        });
      };

      ws.onerror = () => {
        doneRef.current = true;
        flushSync(() => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === aiId
                ? { ...m, content: m.content || "[错误: 连接失败]", isStreaming: false }
                : m,
            ),
          );
          setIsStreaming(false);
        });
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
      const userMsg: Message = { id: nextId(), role: "user", content: question };
      const aiMsg: Message = { id: aiId, role: "assistant", content: "", isStreaming: true };
      setMessages((prev) => [...prev, userMsg, aiMsg]);
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
      const aiMsg: Message = { id: aiId, role: "assistant", content: "", isStreaming: true };
      setMessages((prev) => [...prev, aiMsg]);
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
