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
  const { messages, isStreaming, send, clear } = useChatWS(kbIdNum);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Document | null>(null);
  const [mdContent, setMdContent] = useState("");
  const [filename, setFilename] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openNew = () => {
    setEditDoc(null);
    setMdContent("");
    setFilename("");
    setModalOpen(true);
  };

  const openEdit = async (doc: Document) => {
    setEditDoc(doc);
    setFilename(doc.filename);
    const { content } = await getDocContent(kbIdNum, doc.id);
    setMdContent(content);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
  };

  const handleSave = async () => {
    if (!filename.trim() || !mdContent.trim()) return;
    setSaving(true);
    try {
      if (editDoc) {
        await updateDocument(kbIdNum, editDoc.id, mdContent);
      } else {
        await addDocument(kbIdNum, mdContent, filename.trim());
      }
      closeModal();
      refreshDocs();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-6 max-w-6xl mx-auto h-[calc(100vh-120px)]">
      {/* 文档侧栏 */}
      <div className="w-56 shrink-0 bg-white border rounded-lg p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-sm">{kb?.name ?? "..."}</h2>
          <button
            type="button"
            className="bg-purple-600 text-white rounded px-2 py-0.5 text-xs hover:bg-purple-700"
            onClick={openNew}
          >
            + 新增
          </button>
        </div>
        {docs.length === 0 ? (
          <p className="text-gray-300 text-xs">暂无文档</p>
        ) : (
          docs.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between py-1.5 text-xs border-b border-gray-50 last:border-0"
            >
              <button
                type="button"
                className="text-purple-700 hover:underline text-left truncate flex-1 mr-2"
                onClick={() => openEdit(d)}
              >
                {d.filename}
              </button>
              <button
                type="button"
                className="text-red-400 hover:text-red-600 shrink-0"
                onClick={async () => {
                  await deleteDocument(kbIdNum, d.id);
                  refreshDocs();
                }}
              >
                删
              </button>
            </div>
          ))
        )}
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

      {/* Markdown 编辑弹窗 */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-8"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-lg shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-lg">
                {editDoc ? `编辑: ${editDoc.filename}` : "新建文档"}
              </h3>
              <button
                type="button"
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                onClick={closeModal}
              >
                ×
              </button>
            </div>
            <div className="px-6 py-3 border-b bg-gray-50">
              <label className="text-xs text-gray-500 mr-2">文件名</label>
              <input
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="例如: readme.md"
                className="border rounded px-3 py-1.5 text-sm w-80"
              />
            </div>
            <div className="flex-1 overflow-hidden">
              <Editor value={mdContent} plugins={plugins} onChange={(v) => setMdContent(v)} />
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border rounded"
                onClick={closeModal}
              >
                取消
              </button>
              <button
                type="button"
                className="px-6 py-2 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
                disabled={!filename.trim() || !mdContent.trim() || saving}
                onClick={handleSave}
              >
                {saving ? "保存中..." : editDoc ? "保存修改" : "创建文档"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
