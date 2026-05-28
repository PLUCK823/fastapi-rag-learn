import gfm from "@bytemd/plugin-gfm";
import highlight from "@bytemd/plugin-highlight";
import { Editor } from "@bytemd/react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import "bytemd/dist/index.css";
import "highlight.js/styles/github.css";
import {
  addDocument,
  clearMessages,
  deleteDocument,
  getDocContent,
  listKBs,
  updateDocument,
} from "../api/kb";
import ChatMessage from "../components/chat/ChatMessage";
import { useChatWS } from "../hooks/useChat";
import type { Document, KBDetail } from "../types";

const plugins = [gfm(), highlight()];

export default function ChatPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const kbIdNum = Number(kbId);
  const [kb, setKb] = useState<KBDetail | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [input, setInput] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docName, setDocName] = useState("");
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const { messages, isStreaming, send, clear } = useChatWS(kbIdNum);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const refreshDocs = async () => {
    const kbs = (await listKBs(true)) as KBDetail[];
    const current = kbs.find((k) => k.id === kbIdNum);
    if (current) {
      setKb(current);
      setDocs(current.documents ?? []);
    }
  };

  useEffect(() => {
    refreshDocs();
  }, [kbId]);

  const handleView = async (doc: Document) => {
    setViewingDoc(doc);
    setDocName(doc.filename);
    const { content } = await getDocContent(kbIdNum, doc.id);
    setDocContent(content);
  };

  const resetForm = () => {
    setViewingDoc(null);
    setDocName("");
    setDocContent("");
  };

  return (
    <div className="flex gap-6 max-w-6xl mx-auto h-[calc(100vh-120px)]">
      {/* 文档侧栏 */}
      <div className="w-64 shrink-0 bg-white border rounded-lg p-4 overflow-y-auto">
        <h2 className="font-bold text-sm mb-3">{kb?.name ?? "..."} · 文档</h2>
        <div className="mb-2 border rounded overflow-hidden" style={{ height: 160 }}>
          <Editor value={docContent} plugins={plugins} onChange={(v) => setDocContent(v)} />
        </div>
        <div className="flex gap-1 mb-2">
          <input
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="文件名"
            className="border rounded px-2 py-1 text-xs flex-1"
          />
          {viewingDoc ? (
            <>
              <button
                type="button"
                className="bg-green-600 text-white rounded px-2 py-1 text-xs"
                onClick={async () => {
                  await updateDocument(kbIdNum, viewingDoc.id, docContent);
                  resetForm();
                  refreshDocs();
                }}
              >
                保存
              </button>
              <button
                type="button"
                className="text-xs text-gray-400 hover:text-gray-600 px-1"
                onClick={resetForm}
              >
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="bg-purple-600 text-white rounded px-2 py-1 text-xs"
              onClick={async () => {
                if (!docName.trim() || !docContent.trim()) return;
                try {
                  await addDocument(kbIdNum, docContent, docName.trim());
                  resetForm();
                  refreshDocs();
                } catch (e) {
                  console.error("addDocument failed:", e);
                }
              }}
            >
              新增
            </button>
          )}
        </div>
        {docs.map((d) => (
          <div key={d.id} className="flex items-center justify-between py-1 text-xs">
            <button
              type="button"
              className="text-purple-700 hover:underline text-left truncate max-w-[140px]"
              onClick={() => handleView(d)}
            >
              {d.filename}
            </button>
            <button
              type="button"
              className="text-red-400 hover:text-red-600"
              onClick={async () => {
                await deleteDocument(kbIdNum, d.id);
                if (viewingDoc?.id === d.id) resetForm();
                refreshDocs();
              }}
            >
              删
            </button>
          </div>
        ))}
      </div>

      {/* 聊天区 */}
      <div className="flex-1 flex flex-col bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">对话</h2>
          <button
            type="button"
            className="text-xs text-gray-400 hover:text-red-500"
            onClick={async () => {
              await clearMessages(kbIdNum);
              clear();
            }}
          >
            清空聊天
          </button>
        </div>
        <div className="flex-1 overflow-y-auto mb-4">
          {messages.length === 0 ? (
            <p className="text-gray-300 text-sm text-center mt-20">输入问题开始对话</p>
          ) : (
            messages.map((m) => <ChatMessage key={m.id} msg={m} />)
          )}
          <div ref={bottomRef} />
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isStreaming && input.trim()) {
                send(input.trim());
                setInput("");
              }
            }}
            placeholder="输入问题，按 Enter 发送..."
            className="border rounded px-3 py-2 text-sm flex-1"
            disabled={isStreaming}
          />
          <button
            type="button"
            className="bg-purple-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50"
            disabled={isStreaming || !input.trim()}
            onClick={() => {
              send(input.trim());
              setInput("");
            }}
          >
            {isStreaming ? "回答中..." : "发送"}
          </button>
        </div>
      </div>
    </div>
  );
}
