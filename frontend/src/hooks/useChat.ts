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

/** Delay between visual updates during streaming (ms) — ~300 chars/min typing pace */
const TYPEWRITER_DELAY = 40;
/** Minimum chars to show per visual update */
const CHARS_PER_TICK = 3;

export function useChatWS(kbId: number, sessionId: string | null) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const doneRef = useRef(false);
  const sessionIdRef = useRef(sessionId);
  const shouldLoadMessages = useRef(true);

  // Typewriter buffer: tokens accumulate here at WS speed, flushed to state at typing pace
  const bufferRef = useRef("");
  const shownRef = useRef(0); // how many chars already shown
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const _typewriterTick = useCallback((aiId: string) => {
    if (doneRef.current) return;

    const total = bufferRef.current.length;
    const next = Math.min(shownRef.current + CHARS_PER_TICK, total);
    shownRef.current = next;

    const content = bufferRef.current.slice(0, next);
    // flushSync: force immediate DOM commit so bubble expands frame-by-frame
    flushSync(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === aiId ? { ...m, content, isStreaming: true } : m)),
      );
    });

    if (next < total) {
      timerRef.current = setTimeout(() => _typewriterTick(aiId), TYPEWRITER_DELAY);
    } else {
      timerRef.current = setTimeout(() => _typewriterTick(aiId), TYPEWRITER_DELAY);
    }
  }, []);

  const _finalFlush = useCallback((aiId: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const content = bufferRef.current;
    return content;
  }, []);

  const _startStream = useCallback(
    (aiId: string, question: string, token: string, sid: string) => {
      setIsStreaming(true);
      doneRef.current = false;
      bufferRef.current = "";
      shownRef.current = 0;
      aiIdRef.current = aiId;

      if (timerRef.current) clearTimeout(timerRef.current);

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}&session_id=${sid}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(question);
        // Start typewriter polling
        timerRef.current = setTimeout(() => _typewriterTick(aiId), TYPEWRITER_DELAY);
      };

      ws.onmessage = (e) => {
        if (doneRef.current) return;
        if (typeof e.data === "string" && e.data.startsWith("{")) {
          try {
            const data = JSON.parse(e.data);
            if (data.error) {
              doneRef.current = true;
              if (timerRef.current) clearTimeout(timerRef.current);
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
              const content = _finalFlush(aiId);
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aiId ? { ...m, content, isStreaming: false, sources: data.sources } : m,
                ),
              );
              setIsStreaming(false);
            }
          } catch {
            bufferRef.current += e.data;
          }
        } else {
          bufferRef.current += e.data;
        }
      };

      ws.onclose = () => {
        doneRef.current = true;
        const content = _finalFlush(aiId);
        setMessages((prev) =>
          prev.map((m) => (m.id === aiId ? { ...m, content, isStreaming: false } : m)),
        );
        setIsStreaming(false);
      };

      ws.onerror = () => {
        doneRef.current = true;
        const content = _finalFlush(aiId);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aiId
              ? {
                  ...m,
                  content: content || "[错误: WebSocket 连接失败，请刷新页面重试]",
                  isStreaming: false,
                }
              : m,
          ),
        );
        setIsStreaming(false);
      };
    },
    [kbId, _typewriterTick, _finalFlush],
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
