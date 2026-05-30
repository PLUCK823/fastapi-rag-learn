/** 骨架屏组件 — 用于数据加载时的占位动画 */

interface SkeletonProps {
  className?: string;
  /** 行数（文本骨架） */
  lines?: number;
  /** 块级骨架（卡片等） */
  type?: "text" | "card" | "circle" | "inline";
  width?: string;
  height?: string;
}

const BASE_CLASS = "animate-pulse rounded-md";
const BASE_STYLE = { backgroundColor: "var(--surface-bg)" };

function SkeletonLine({ width = "100%", last }: { width?: string; last?: boolean }) {
  return (
    <div
      className={BASE_CLASS}
      style={{ ...BASE_STYLE, height: "0.85rem", width, marginBottom: last ? 0 : "0.5rem" }}
    />
  );
}

export default function Skeleton({
  className,
  lines = 3,
  type = "text",
  width,
  height,
}: SkeletonProps) {
  if (type === "circle") {
    return (
      <div
        className={`${BASE_CLASS} rounded-full ${className ?? ""}`}
        style={{ ...BASE_STYLE, width: width ?? "2.5rem", height: height ?? "2.5rem" }}
      />
    );
  }

  if (type === "inline") {
    return (
      <div
        className={`${BASE_CLASS} ${className ?? ""}`}
        style={{ ...BASE_STYLE, width: width ?? "6rem", height: height ?? "1rem" }}
      />
    );
  }

  if (type === "card") {
    return (
      <div
        className={`${BASE_CLASS} ${className ?? ""}`}
        style={{
          ...BASE_STYLE,
          height: height ?? "5rem",
          width: width ?? "100%",
        }}
      >
        <div className="px-5 py-4 space-y-2">
          <SkeletonLine width="60%" />
          <SkeletonLine width="30%" last />
        </div>
      </div>
    );
  }

  // text: multiple lines
  return (
    <div className={className}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={`sk-${i}`}
          width={i === lines - 1 ? "50%" : "100%"}
          last={i === lines - 1}
        />
      ))}
    </div>
  );
}

/** 知识库列表骨架 */
export function KBListSkeleton() {
  return (
    <div className="max-w-3xl mx-auto space-y-3 animate-fade-in-up">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={`kb-sk-${i}`} type="card" />
      ))}
    </div>
  );
}

/** 聊天消息骨架 */
export function ChatSkeleton() {
  return (
    <div className="space-y-4 px-4 py-6 animate-fade-in-up">
      {/* 用户消息 */}
      <div className="flex justify-end">
        <Skeleton width="60%" height="2.5rem" type="card" />
      </div>
      {/* AI 消息 */}
      <div className="flex justify-start">
        <Skeleton width="80%" height="4rem" type="card" />
      </div>
    </div>
  );
}

/** 文档列表骨架 */
export function DocListSkeleton() {
  return (
    <div className="space-y-2 px-3 py-4">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={`doc-sk-${i}`} width="100%" height="2rem" type="card" />
      ))}
    </div>
  );
}
