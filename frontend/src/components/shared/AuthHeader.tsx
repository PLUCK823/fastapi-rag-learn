import { Link } from "react-router-dom";
import ThemeToggle from "./ThemeToggle";

export default function AuthHeader() {
  return (
    <div className="px-6 py-5 flex items-center justify-between">
      <Link to="/" className="inline-flex items-center gap-2.5 group">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "var(--color-ink)" }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect
              x="3"
              y="2"
              width="18"
              height="14"
              rx="2"
              stroke="var(--color-copper)"
              strokeWidth="1.5"
            />
            <line
              x1="6"
              y1="6"
              x2="18"
              y2="6"
              stroke="var(--color-copper)"
              strokeWidth="1.2"
              opacity="0.5"
            />
            <circle cx="5" cy="20" r="2" stroke="var(--color-sage)" strokeWidth="1.5" />
            <circle cx="12" cy="20" r="2" stroke="var(--color-sage)" strokeWidth="1.5" />
            <circle cx="19" cy="20" r="2" stroke="var(--color-sage)" strokeWidth="1.5" />
          </svg>
        </div>
        <span className="display-text text-lg tracking-tight" style={{ color: "var(--color-ink)" }}>
          RAG Learn
        </span>
      </Link>
      <ThemeToggle />
    </div>
  );
}
