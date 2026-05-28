import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { createKB, deleteKB, listKBs } from "../api/kb";
import type { KBDetail, KnowledgeBase } from "../types";

export default function KBListPage() {
  const [kbs, setKBs] = useState<(KnowledgeBase | KBDetail)[]>([]);
  const [newName, setNewName] = useState("");

  const refresh = () => listKBs(true).then(setKBs);
  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">我的知识库</h1>
      <div className="flex gap-2 mb-6">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="知识库名称"
          className="border rounded px-3 py-2 text-sm flex-1"
        />
        <button
          type="button"
          className="bg-purple-600 text-white rounded px-4 py-2 text-sm hover:bg-purple-700"
          onClick={async () => {
            if (!newName.trim()) return;
            await createKB(newName.trim());
            setNewName("");
            refresh();
          }}
        >
          创建
        </button>
      </div>
      {kbs.length === 0 ? (
        <p className="text-gray-400 text-sm">暂无知识库，创建一个开始吧。</p>
      ) : (
        <div className="space-y-3">
          {kbs.map((kb) => (
            <div
              key={kb.id}
              className="bg-white border rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <Link to={`/chat/${kb.id}`} className="font-medium text-purple-700 hover:underline">
                  {kb.name}
                </Link>
                <span className="text-xs text-gray-400 ml-3">{kb.document_count} 篇文档</span>
              </div>
              <button
                type="button"
                className="text-xs text-red-500 hover:text-red-700"
                onClick={async () => {
                  if (!confirm(`确定删除「${kb.name}」及其所有文档？`)) return;
                  await deleteKB(kb.id);
                  refresh();
                }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
