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
        <div className="flex min-h-screen items-center justify-center bg-[#0f0f23] p-10">
          <div className="max-w-[400px] text-center">
            <div className="mb-4 text-[48px]">🧠</div>
            <h2 className="text-orange m-0 mb-3 text-xl font-bold">Something went wrong</h2>
            <p className="m-0 mb-6 text-sm leading-relaxed text-[#888]">
              OpenBrain hit an unexpected error. Your data is safe in the database.
            </p>
            <p className="m-0 mb-6 rounded-lg bg-[#1a1a2e] p-3 text-left font-mono text-xs break-all text-[#555]">
              {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
              }}
              className="gradient-accent cursor-pointer rounded-xl border-none px-8 py-3 text-sm font-bold text-[#0f0f23]"
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
