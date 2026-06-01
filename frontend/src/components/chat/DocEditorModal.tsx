import gfm from "@bytemd/plugin-gfm";
import highlight from "@bytemd/plugin-highlight";
import { Editor } from "@bytemd/react";
import { useEffect, useRef, useState } from "react";
import "bytemd/dist/index.css";
import "highlight.js/styles/github.css";
import { addDocument, renameDocument, updateDocument } from "../../api/kb";
import { toast } from "../../stores/toastStore";
import type { Document } from "../../types";
import { getErrorMessage } from "../../utils/error";

const plugins = [gfm(), highlight()];

interface DocEditorModalProps {
  kbId: number;
  editDoc: Document | null;
  initialContent: string;
  onClose: () => void;
  onSaved: () => void;
}

export default function DocEditorModal({
  kbId,
  editDoc,
  initialContent,
  onClose,
  onSaved,
}: DocEditorModalProps) {
  const [mdContent, setMdContent] = useState(initialContent);
  const baseFilename = editDoc?.filename ? editDoc.filename.replace(/\.md$/i, "") : "";
  const [filename, setFilename] = useState(baseFilename);
  const [saving, setSaving] = useState(false);

  // Inject content into CodeMirror after mount (ByteMD uses CodeMirror internally)
  const editorRef = useRef<HTMLDivElement>(null);
  const contentInjected = useRef(false);

  useEffect(() => {
    if (contentInjected.current || !initialContent) return;
    contentInjected.current = true;
    // Wait for CodeMirror to initialize
    const timer = setInterval(() => {
      const cmEl = document.querySelector(".bytemd-editor .CodeMirror") as {
        CodeMirror?: { setValue(v: string): void };
      } | null;
      if (cmEl?.CodeMirror) {
        cmEl.CodeMirror.setValue(initialContent);
        clearInterval(timer);
      }
    }, 50);
    // Safety timeout
    setTimeout(() => clearInterval(timer), 3000);
    return () => clearInterval(timer);
  }, [initialContent]);

  const handleSave = async () => {
    if (!filename.trim()) {
      toast("请输入文件名", "info");
      return;
    }
    if (!mdContent.trim()) {
      toast("请输入文档内容", "info");
      return;
    }
    const name = filename.trim();
    const finalName = `${name}.md`;
    setSaving(true);
    try {
      if (editDoc) {
        await updateDocument(kbId, editDoc.id, mdContent);
        if (finalName !== editDoc.filename) {
          await renameDocument(kbId, editDoc.id, finalName);
        }
        toast("文档已更新", "success");
      } else {
        await addDocument(kbId, mdContent, finalName);
        toast("文档创建成功", "success");
      }
      onSaved();
      onClose();
    } catch (err) {
      toast(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in"
      style={{
        backgroundColor: "var(--overlay-heavy)",
        backdropFilter: "blur(3px)",
      }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-fade-in-up"
        style={{ animationDelay: "50ms" }}
        onClick={(e) => e.stopPropagation()}
        ref={editorRef}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "var(--border-light)" }}
        >
          <h3 className="display-text text-base" style={{ color: "var(--text-primary)" }}>
            {editDoc ? `编辑: ${editDoc.filename}` : "新建文档"}
          </h3>
          <button
            type="button"
            className="text-xl leading-none p-1 rounded transition-colors"
            style={{ color: "var(--text-muted)" }}
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Filename input */}
        <div
          className="px-6 py-3 flex items-center gap-3"
          style={{
            backgroundColor: "var(--surface-bg)",
            borderBottom: "var(--border-light)",
          }}
        >
          <label
            className="text-xs font-medium shrink-0"
            style={{ color: "var(--text-secondary)" }}
          >
            文件名
          </label>
          <div
            className="flex-1 flex items-center rounded-md overflow-hidden"
            style={{ border: "var(--border-medium)" }}
          >
            <input
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="例如: readme"
              className="flex-1 px-3 py-1.5 text-sm outline-none"
              style={{
                backgroundColor: "var(--surface-card)",
                color: "var(--text-primary)",
              }}
            />
            <span
              className="px-2.5 py-1.5 text-sm font-medium select-none shrink-0"
              style={{
                backgroundColor: "var(--surface-bg)",
                color: "var(--text-muted)",
                borderLeft: "var(--border-light)",
              }}
            >
              .md
            </span>
          </div>
        </div>

        {/* Editor — bytemd-host bridges height from flex container into ByteMD */}
        <div className="flex-1 overflow-hidden flex flex-col" style={{ minHeight: 0 }}>
          <div className="flex-1 bytemd-host" style={{ minHeight: 0 }}>
            <Editor value={mdContent} plugins={plugins} onChange={(v) => setMdContent(v)} />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-3 px-6 py-4"
          style={{
            borderTop: "var(--border-light)",
            backgroundColor: "var(--surface-bg)",
          }}
        >
          <button
            type="button"
            className="px-4 py-2 rounded-lg text-sm transition-colors"
            style={{
              color: "var(--text-secondary)",
              border: "var(--border-medium)",
              backgroundColor: "transparent",
            }}
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="px-6 py-2 rounded-lg text-sm font-medium transition-all duration-200 disabled:opacity-50"
            style={{
              backgroundColor: "var(--color-ink)",
              color: "var(--color-cream)",
            }}
            disabled={!filename.trim() || !mdContent.trim() || saving}
            onClick={handleSave}
          >
            {saving ? "保存中..." : editDoc ? "保存修改" : "创建文档"}
          </button>
        </div>
      </div>
    </div>
  );
}
