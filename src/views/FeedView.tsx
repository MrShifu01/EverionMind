interface FeedViewProps {
  onCapture: () => void;
}

export default function FeedView({ onCapture }: FeedViewProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <div className="text-5xl">🧠</div>
      <h2
        className="text-on-surface text-xl font-bold"
        style={{ fontFamily: "'Lora', Georgia, serif" }}
      >
        Your Feed is coming soon
      </h2>
      <p className="text-on-surface-variant max-w-sm text-sm">
        This will be your daily brain digest — resurfaced memories, insights, and suggestions.
      </p>
      <button
        onClick={onCapture}
        className="press-scale text-on-primary rounded-xl px-6 py-3 text-sm font-semibold transition-all"
        style={{ background: "var(--color-primary)" }}
      >
        Capture a thought
      </button>
    </div>
  );
}
