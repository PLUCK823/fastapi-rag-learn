import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { addDocument, deleteDocument, getDocContent, listKBs, updateDocument } from "../api/kb";
import { useChatWS } from "../hooks/useChat";
import type { Document, KBDetail } from "../types";

export default function ChatPage() {
  const { kbId } = useParams<{ kbId: string }>();
  const kbIdNum = Number(kbId);
  const [kb, setKb] = useState<KBDetail | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [input, setInput] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docName, setDocName] = useState("");
  const [viewingDoc, setViewingDoc] = useState<Document | null>(null);
  const { streamingText, isStreaming, send, setStreamingText } = useChatWS(kbIdNum);

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
    const { content } = await getDocContent(kbIdNum, doc.id);
    setDocContent(content);
  };

  return (
    <div className="flex gap-6 max-w-6xl mx-auto h-[calc(100vh-120px)]">
      <div className="w-64 shrink-0 bg-white border rounded-lg p-4 overflow-y-auto">
        <h2 className="font-bold text-sm mb-3">{kb?.name ?? "..."} · 文档</h2>
        <div className="flex gap-1 mb-3">
          <input
            value={docName}
            onChange={(e) => setDocName(e.target.value)}
            placeholder="文件名"
            className="border rounded px-2 py-1 text-xs flex-1"
          />
          <button
            type="button"
            className="bg-purple-600 text-white rounded px-2 py-1 text-xs"
            onClick={async () => {
              if (!docName.trim() || !docContent.trim()) return;
              await addDocument(kbIdNum, docContent, docName.trim());
              setDocContent("");
              setDocName("");
              refreshDocs();
            }}
          >
            新增
          </button>
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
                refreshDocs();
              }}
            >
              删
            </button>
          </div>
        ))}
      </div>
      <div className="flex-1 flex flex-col bg-white border rounded-lg p-4">
        <div className="flex-1 overflow-y-auto mb-4 whitespace-pre-wrap text-sm text-gray-700">
          {streamingText || <span className="text-gray-300">输入问题开始对话</span>}
        </div>
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isStreaming && input.trim()) {
                setStreamingText("");
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
              setStreamingText("");
              send(input.trim());
              setInput("");
            }}
          >
            {isStreaming ? "回答中..." : "发送"}
          </button>
        </div>
      </div>
      {viewingDoc && (
        <div className="w-80 shrink-0 bg-white border rounded-lg p-4 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm">{viewingDoc.filename}</h3>
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-gray-600"
              onClick={() => setViewingDoc(null)}
            >
              关闭
            </button>
          </div>
          <textarea
            className="w-full h-[calc(100vh-220px)] border rounded p-2 text-xs font-mono resize-none"
            value={docContent}
            onChange={(e) => setDocContent(e.target.value)}
          />
          <button
            type="button"
            className="mt-3 w-full bg-purple-600 text-white rounded py-1 text-xs"
            onClick={async () => {
              await updateDocument(kbIdNum, viewingDoc.id, docContent);
              refreshDocs();
            }}
          >
            保存修改
          </button>
        </div>
      )}
    </div>
  );
}
