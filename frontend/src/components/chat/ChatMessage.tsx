import type { Message } from "../../types";

export default function ChatMessage({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-3`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
          isUser
            ? "bg-purple-600 text-white rounded-br-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-sm"
        }`}
      >
        {msg.content || (msg.isStreaming && <span className="animate-pulse">▊</span>)}
        {msg.sources && msg.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-300 text-xs text-gray-500">
            {msg.sources.map((s) => (
              <div key={s.index}>
                [{s.index}] {s.document_name}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
