import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export default class ErrorBoundary extends Component<
	ErrorBoundaryProps,
	ErrorBoundaryState
> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		console.error("ErrorBoundary caught:", error, info.componentStack);
	}

	handleReset = () => {
		this.setState({ hasError: false, error: null });
	};

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) return this.props.fallback;
			return (
				<DefaultFallback error={this.state.error} onReset={this.handleReset} />
			);
		}
		return this.props.children;
	}
}

function DefaultFallback({
	error,
	onReset,
}: {
	error: Error | null;
	onReset: () => void;
}) {
	return (
		<div
			className="min-h-screen flex items-center justify-center p-6"
			style={{ backgroundColor: "var(--surface-bg)" }}
		>
			<div className="card p-8 max-w-md w-full text-center animate-fade-in-up">
				<div
					className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
					style={{ backgroundColor: "var(--danger-bg)" }}
				>
					<svg
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="var(--danger)"
						strokeWidth="1.5"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="8" x2="12" y2="12" />
						<line x1="12" y1="16" x2="12.01" y2="16" />
					</svg>
				</div>
				<h1
					className="display-text text-lg mb-2"
					style={{ color: "var(--text-primary)" }}
				>
					页面出错了
				</h1>
				<p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
					遇到了意外错误，请尝试刷新页面。如果问题持续，请联系管理员。
				</p>
				{error?.message && (
					<pre
						className="text-xs mb-6 px-3 py-2 rounded-md text-left overflow-auto max-h-32"
						style={{
							backgroundColor: "var(--danger-bg)",
							color: "var(--danger)",
							whiteSpace: "pre-wrap",
							wordBreak: "break-word",
						}}
					>
						{error.message}
					</pre>
				)}
				<button
					type="button"
					className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
					style={{
						backgroundColor: "var(--color-ink)",
						color: "var(--color-cream)",
					}}
					onClick={onReset}
				>
					重试
				</button>
			</div>
		</div>
	);
}
