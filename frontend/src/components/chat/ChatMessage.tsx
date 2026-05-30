import React, { useCallback, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { submitFeedback } from "../../api/kb";
import { toast } from "../../stores/toastStore";
import type { Message } from "../../types";

/** 从 React children 中递归提取纯文本 */
function extractText(children: React.ReactNode): string {
	if (typeof children === "string") return children;
	if (typeof children === "number") return String(children);
	if (Array.isArray(children)) return children.map(extractText).join("");
	if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
		return extractText(
			(children.props as { children?: React.ReactNode }).children,
		);
	}
	return "";
}

/** 代码块 + 复制按钮 */
function CodeBlockWithCopy({
	raw,
	children,
}: {
	raw: string;
	children: React.ReactNode;
}) {
	const [copied, setCopied] = React.useState(false);
	const handleCopy = () => {
		navigator.clipboard.writeText(raw).then(
			() => {
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			},
			() => {
				// Fallback
				const ta = document.createElement("textarea");
				ta.value = raw;
				ta.style.cssText = "position:fixed;opacity:0";
				document.body.appendChild(ta);
				ta.select();
				document.execCommand("copy");
				document.body.removeChild(ta);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			},
		);
	};

	return (
		<div className="relative group my-2">
			<button
				type="button"
				className="absolute top-2 right-2 z-10 flex items-center gap-1 px-1.5 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
				style={{
					backgroundColor: "var(--on-ink-subtle)",
					color: "var(--on-ink-muted)",
				}}
				onClick={handleCopy}
				aria-label={copied ? "已复制" : "复制代码"}
			>
				{copied ? "已复制" : "复制"}
			</button>
			<pre
				className="rounded-lg overflow-x-auto"
				style={{ backgroundColor: "var(--color-ink)" }}
			>
				{children}
			</pre>
		</div>
	);
}

/** 格式化时间戳：< 1 分钟 → "刚刚"，< 1 小时 → "X 分钟前"，同一天 → "HH:MM"，更早 → "MM-DD HH:MM" */
function formatTime(iso?: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return "";
	const now = Date.now();
	const diffSec = Math.floor((now - d.getTime()) / 1000);
	if (diffSec < 60) return "刚刚";
	if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
	const nowDate = new Date(now);
	if (
		d.getFullYear() === nowDate.getFullYear() &&
		d.getMonth() === nowDate.getMonth() &&
		d.getDate() === nowDate.getDate()
	) {
		return d.toLocaleTimeString("zh-CN", {
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ChatMessage({ msg }: { msg: Message }) {
	const isUser = msg.role === "user";
	const [feedback, setFeedback] = useState<boolean | null | undefined>(
		msg.feedback,
	);
	const [feedbackLoading, setFeedbackLoading] = useState(false);

	const handleFeedback = useCallback(
		async (value: boolean) => {
			if (feedbackLoading) return;
			const msgId = typeof msg.id === "string" ? parseInt(msg.id, 10) : msg.id;
			if (!msgId || Number.isNaN(msgId)) return;
			setFeedbackLoading(true);
			try {
				await submitFeedback(msgId, value);
				setFeedback(value);
			} catch {
				toast("反馈提交失败", "error");
			} finally {
				setFeedbackLoading(false);
			}
		},
		[msg.id, feedbackLoading],
	);

	return (
		<div
			className={`chat-message group flex mb-4 ${isUser ? "justify-end" : "justify-start"} animate-fade-in-up`}
			data-role={msg.role}
		>
			<div
				className={`flex flex-col ${isUser ? "items-end" : "items-start"} max-w-[78%]`}
			>
				<div
					className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
						isUser ? "rounded-br-md" : "rounded-bl-md"
					}`}
					style={
						isUser
							? {
									backgroundColor: "var(--color-ink)",
									color: "var(--color-cream)",
								}
							: {
									backgroundColor: "var(--surface-bg)",
									color: "var(--text-primary)",
									border: "var(--border-light)",
								}
					}
				>
					{msg.content ? (
						isUser ? (
							<div className="whitespace-pre-wrap break-words">
								{msg.content}
							</div>
						) : (
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								components={{
									// Style code blocks
									code: ({ className, children, ...props }) => {
										const isInline = !className;
										if (isInline) {
											return (
												<code
													className="px-1.5 py-0.5 rounded text-xs font-mono"
													style={{
														backgroundColor: "var(--surface-card)",
														color: "var(--color-copper)",
													}}
													{...props}
												>
													{children}
												</code>
											);
										}
										return (
											<code
												className="block px-3 py-2 text-xs font-mono overflow-x-auto"
												style={{ color: "var(--color-cream)" }}
												{...props}
											>
												{children}
											</code>
										);
									},
									pre: ({ children }) => {
										const raw = extractText(children);
										return (
											<CodeBlockWithCopy raw={raw}>
												{children}
											</CodeBlockWithCopy>
										);
									},
									// Style links
									a: ({ href, children }) => (
										<a
											href={href}
											target="_blank"
											rel="noopener noreferrer"
											style={{ color: "var(--color-copper)" }}
											className="underline underline-offset-2"
										>
											{children}
										</a>
									),
									// Style lists
									ul: ({ children }) => (
										<ul className="list-disc pl-4 my-1 space-y-0.5">
											{children}
										</ul>
									),
									ol: ({ children }) => (
										<ol className="list-decimal pl-4 my-1 space-y-0.5">
											{children}
										</ol>
									),
									// Style headings
									h1: ({ children }) => (
										<h1 className="text-lg font-bold my-2">{children}</h1>
									),
									h2: ({ children }) => (
										<h2 className="text-base font-bold my-1.5">{children}</h2>
									),
									h3: ({ children }) => (
										<h3 className="text-sm font-bold my-1">{children}</h3>
									),
									// Style blockquotes
									blockquote: ({ children }) => (
										<blockquote
											className="border-l-2 pl-3 my-1 italic"
											style={{
												borderColor: "var(--color-copper)",
												color: "var(--text-secondary)",
											}}
										>
											{children}
										</blockquote>
									),
									// Style tables
									table: ({ children }) => (
										<div className="overflow-x-auto my-2">
											<table className="min-w-full text-xs border-collapse">
												{children}
											</table>
										</div>
									),
									th: ({ children }) => (
										<th
											className="px-2 py-1 text-left font-medium"
											style={{
												backgroundColor: "var(--surface-card)",
												borderBottom: "var(--border-medium)",
											}}
										>
											{children}
										</th>
									),
									td: ({ children }) => (
										<td
											className="px-2 py-1"
											style={{ borderBottom: "var(--border-light)" }}
										>
											{children}
										</td>
									),
								}}
							>
								{msg.content}
							</ReactMarkdown>
						)
					) : msg.isStreaming ? (
						<span className="inline-block animate-pulse-soft">▊</span>
					) : null}

					{/* Sources */}
					{msg.sources && msg.sources.length > 0 && (
						<div
							className="mt-3 pt-3 flex flex-wrap gap-1.5"
							style={{
								borderTop: isUser
									? "var(--on-ink-divider)"
									: "var(--border-light)",
							}}
						>
							{msg.sources.map((s) => (
								<span
									key={s.index}
									className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]"
									style={
										isUser
											? {
													backgroundColor: "var(--on-ink-subtle)",
													color: "var(--on-ink-dim)",
												}
											: {
													backgroundColor: "var(--surface-card)",
													color: "var(--text-muted)",
													border: "var(--border-light)",
												}
									}
								>
									<span
										className="font-medium"
										style={{
											color: isUser ? "var(--on-ink-bright)" : "var(--accent)",
										}}
									>
										[{s.index}]
									</span>
									{s.document_name}
								</span>
							))}
						</div>
					)}
				</div>

				{/* Timestamp + Feedback */}
				<div className="flex items-center gap-2 mt-1 px-1">
					{msg.created_at && (
						<span
							className="text-[10px] select-none"
							style={{ color: "var(--text-muted)" }}
						>
							{formatTime(msg.created_at)}
						</span>
					)}
					{!isUser && typeof msg.id === "number" && msg.id > 0 && (
						<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
							<button
								type="button"
								className="p-0.5 rounded transition-colors"
								style={{
									color:
										feedback === true
											? "var(--accent-sage)"
											: "var(--text-muted)",
								}}
								onClick={() => handleFeedback(true)}
								disabled={feedbackLoading}
								aria-label="赞"
								title="有帮助"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill={feedback === true ? "currentColor" : "none"}
									stroke="currentColor"
									strokeWidth="1.5"
									aria-hidden="true"
								>
									<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
								</svg>
							</button>
							<button
								type="button"
								className="p-0.5 rounded transition-colors"
								style={{
									color:
										feedback === false ? "var(--danger)" : "var(--text-muted)",
								}}
								onClick={() => handleFeedback(false)}
								disabled={feedbackLoading}
								aria-label="踩"
								title="没帮助"
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill={feedback === false ? "currentColor" : "none"}
									stroke="currentColor"
									strokeWidth="1.5"
									aria-hidden="true"
								>
									<path d="M10 15v4a3 3 0 0 0 3 3l4-9V4H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
								</svg>
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
