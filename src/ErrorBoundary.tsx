import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

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
    Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen items-center justify-center p-10"
          style={{ background: "var(--color-background)", color: "var(--color-on-surface)" }}
        >
          <div className="max-w-[400px] text-center">
            <div className="mb-4 flex justify-center" aria-hidden="true">
              <svg
                width={48}
                height={48}
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--color-primary)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8.5 3a3.5 3.5 0 0 0-3.5 3.5c-1.5.5-2.5 2-2.5 3.5 0 1 .5 2 1.5 2.5-.5.8-.5 2 0 3 .3.6.8 1 1.5 1.3-.2.9.1 2 .8 2.7.8.7 2 1 3 .5.3 1 1.3 2 2.7 2A2.5 2.5 0 0 0 14.5 20V4.5A1.5 1.5 0 0 0 13 3M15.5 3A3.5 3.5 0 0 1 19 6.5c1.5.5 2.5 2 2.5 3.5 0 1-.5 2-1.5 2.5.5.8.5 2 0 3-.3.6-.8 1-1.5 1.3.2.9-.1 2-.8 2.7-.8.7-2 1-3 .5-.3 1-1.3 2-2.7 2A2.5 2.5 0 0 1 9.5 20V4.5A1.5 1.5 0 0 1 11 3" />
              </svg>
            </div>
            <h2 className="m-0 mb-3 text-xl font-bold" style={{ color: "var(--color-primary)" }}>
              Something went wrong
            </h2>
            <p
              className="m-0 mb-6 text-sm leading-relaxed"
              style={{ color: "var(--color-on-surface-variant)" }}
            >
              Everion hit an unexpected error. Your data is safe in the database.
            </p>
            <p
              className="m-0 mb-6 rounded-lg p-3 text-left font-mono text-xs break-all"
              style={{
                background: "var(--color-surface-container)",
                color: "var(--color-on-surface-variant)",
              }}
            >
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
