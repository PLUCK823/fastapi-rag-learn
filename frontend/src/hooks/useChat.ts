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
    // Reset the flag when sessionId changes so we can load messages for the new session
    shouldLoadMessages.current = true;
  }, [sessionId]);

  // Load session messages when sessionId changes
  useEffect(() => {
    console.log("useEffect triggered:", {
      sessionId,
      shouldLoadMessages: shouldLoadMessages.current,
      kbId,
    });
    if (sessionId && shouldLoadMessages.current) {
      console.log("useEffect: loading messages from backend for session:", sessionId);
      listSessionMessages(kbId, sessionId).then((msgs) => {
        console.log("useEffect: loaded messages:", msgs.length);
        setMessages(msgs);
      });
    } else if (!sessionId) {
      console.log("useEffect: clearing messages (no sessionId)");
      setMessages([]);
    } else {
      console.log("useEffect: skipping load (shouldLoadMessages=false)");
    }
    // Do NOT reset flag here - let it stay false until next sessionId change
  }, [kbId, sessionId]);

  // Prepare for send - prevent useEffect from loading messages
  const prepareSend = useCallback(() => {
    shouldLoadMessages.current = false;
  }, []);

  const send = useCallback(
    (question: string, overrideSessionId?: string) => {
      const token = localStorage.getItem("token");
      // Use override if provided, otherwise use current ref value
      const sid = overrideSessionId ?? sessionIdRef.current;

      console.log("send() called:", { question, overrideSessionId, sid, token: !!token, kbId });

      if (!token || !sid) {
        console.log("send() early return: missing token or sid");
        return;
      }

      const aiId = nextId();
      const userMsg: Message = { id: nextId(), role: "user", content: question };
      const aiMsg: Message = { id: aiId, role: "assistant", content: "", isStreaming: true };

      console.log("send() adding messages:", { userMsg, aiMsg });
      setMessages((prev) => [...prev, userMsg, aiMsg]);
      setIsStreaming(true);
      doneRef.current = false;

      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      const host = window.location.host;
      const url = `${proto}://${host}/ws/${kbId}?token=${token}&session_id=${sid}`;

      console.log("send() WebSocket URL:", url);

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket opened, sending question:", question);
        ws.send(question);
      };

      ws.onmessage = (e) => {
        console.log("WebSocket message received:", e.data.substring(0, 100));
        if (doneRef.current) return;
        try {
          const data = JSON.parse(e.data);
          if (data.error) {
            console.log("WebSocket error message:", data.error);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, content: `[错误: ${data.error}]`, isStreaming: false } : m,
              ),
            );
            setIsStreaming(false);
            doneRef.current = true;
          } else if (data.done) {
            console.log("WebSocket done, sources:", data.sources);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === aiId ? { ...m, isStreaming: false, sources: data.sources } : m,
              ),
            );
            setIsStreaming(false);
            doneRef.current = true;
          }
        } catch {
          console.log("WebSocket streaming chunk:", e.data);
          setMessages((prev) =>
            prev.map((m) => (m.id === aiId ? { ...m, content: m.content + e.data } : m)),
          );
        }
      };

      ws.onclose = (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, isStreaming: false } : m)));
        setIsStreaming(false);
        doneRef.current = true;
      };

      ws.onerror = (event) => {
        console.log("WebSocket error:", event);
        setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, isStreaming: false } : m)));
        setIsStreaming(false);
        doneRef.current = true;
      };
    },
    [kbId, sessionId],
  );

  const clear = useCallback(() => setMessages([]), []);

  return { messages, isStreaming, send, clear, setMessages, prepareSend };
}
