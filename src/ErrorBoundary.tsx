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
        <div style={{ minHeight: "100vh", background: "#0f0f23", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
          <div style={{ textAlign: "center", maxWidth: 400 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🧠</div>
            <h2 style={{ color: "#FF6B35", fontSize: 20, fontWeight: 700, margin: "0 0 12px" }}>Something went wrong</h2>
            <p style={{ color: "#888", fontSize: 14, lineHeight: 1.6, margin: "0 0 24px" }}>
              OpenBrain hit an unexpected error. Your data is safe in the database.
            </p>
            <p style={{ color: "#555", fontSize: 12, margin: "0 0 24px", fontFamily: "monospace", background: "#1a1a2e", padding: 12, borderRadius: 8, textAlign: "left", wordBreak: "break-all" }}>
              {this.state.error?.message || "Unknown error"}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); }}
              style={{ padding: "12px 32px", background: "linear-gradient(135deg, #4ECDC4, #45B7D1)", border: "none", borderRadius: 12, color: "#0f0f23", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
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
