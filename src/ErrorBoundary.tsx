import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("OpenBrain error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-10" style={{ background: "var(--color-background)", color: "var(--color-on-surface)" }}>
          <div className="max-w-[400px] text-center">
            <div className="mb-4 text-[48px]">🧠</div>
            <h2 className="m-0 mb-3 text-xl font-bold" style={{ color: "var(--color-primary)" }}>Something went wrong</h2>
            <p className="m-0 mb-6 text-sm leading-relaxed" style={{ color: "var(--color-on-surface-variant)" }}>
              Everion hit an unexpected error. Your data is safe in the database.
            </p>
            <p className="m-0 mb-6 rounded-lg p-3 text-left font-mono text-xs break-all" style={{ background: "var(--color-surface-container)", color: "var(--color-on-surface-variant)" }}>
              {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
              className="cursor-pointer rounded-xl border-none px-8 py-3 text-sm font-bold"
              style={{ background: "var(--color-primary)", color: "var(--color-on-primary)" }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
