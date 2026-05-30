import { type ReactNode, useState } from "react";

const STORAGE_KEY = "onboarding_done";

export function hasOnboardingDone(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "1";
}

export function markOnboardingDone(): void {
  localStorage.setItem(STORAGE_KEY, "1");
}

interface Step {
  icon: ReactNode;
  title: string;
  desc: string;
}

const STEPS: Step[] = [
  {
    icon: (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
    title: "上传文档",
    desc: "点击「上传」按钮或拖拽文件到页面，支持 .txt / .md / .pdf",
  },
  {
    icon: (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
    title: "提问获取答案",
    desc: "在输入框中输入问题，AI 将根据你的文档内容给出带引用来源的回答",
  },
  {
    icon: (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
        <line x1="8" y1="11" x2="14" y2="11" />
      </svg>
    ),
    title: "点击引用溯源",
    desc: "回答中的 [N] 标记是引用来源，点击即可查看原始文档内容",
  },
];

interface Props {
  open: boolean;
  onDone: () => void;
}

export default function OnboardingGuide({ open, onDone }: Props) {
  const [step, setStep] = useState(0);

  if (!open) return null;

  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      markOnboardingDone();
      onDone();
    } else {
      setStep((s) => s + 1);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: "var(--overlay)", backdropFilter: "blur(3px)" }}
    >
      <div
        className="card p-8 w-full max-w-sm text-center animate-fade-in-up"
        style={{ animationDuration: "200ms" }}
      >
        {/* Step dots */}
        <div className="flex justify-center gap-2 mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="rounded-full transition-all"
              style={{
                width: i === step ? "1.5rem" : "0.4rem",
                height: "0.4rem",
                backgroundColor: i === step ? "var(--color-copper)" : "var(--border-color-medium)",
                borderRadius: "0.2rem",
              }}
            />
          ))}
        </div>

        {/* Icon */}
        <div
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5"
          style={{
            backgroundColor: "var(--surface-bg)",
            color: "var(--color-copper)",
          }}
        >
          {STEPS[step].icon}
        </div>

        {/* Title */}
        <h3 className="display-text text-lg mb-2" style={{ color: "var(--text-primary)" }}>
          {STEPS[step].title}
        </h3>

        {/* Description */}
        <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {STEPS[step].desc}
        </p>

        {/* Actions */}
        <button
          type="button"
          className="w-full py-2.5 rounded-lg text-sm font-medium transition-all active:scale-[0.96]"
          style={{
            backgroundColor: "var(--color-ink)",
            color: "var(--color-cream)",
          }}
          onClick={handleNext}
        >
          {isLast ? "开始使用" : "下一步"}
        </button>

        <button
          type="button"
          className="w-full mt-2 py-2 text-xs transition-colors"
          style={{ color: "var(--text-muted)" }}
          onClick={() => {
            markOnboardingDone();
            onDone();
          }}
        >
          跳过引导
        </button>
      </div>
    </div>
  );
}
