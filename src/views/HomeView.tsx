import { useMemo, useState } from "react";
import type { Entry } from "../types";
import FirstRunChecklist from "../components/FirstRunChecklist";
import GreetingHero from "../components/home/GreetingHero";
import TodayCard from "../components/home/TodayCard";
import InboxTriageCard from "../components/home/InboxTriageCard";
import RecentCapturesStrip from "../components/home/RecentCapturesStrip";
import QuickCaptureChips from "../components/home/QuickCaptureChips";

interface HomeViewProps {
  entries: Entry[];
  brainCount: number;
  brainName?: string;
  brainId?: string;
  isPersonalBrain: boolean;
  stagedCount: number;
  onNavigate: (view: string) => void;
  onOpenCapture: () => void;
  onOpenCaptureWith: (initialText: string) => void;
  onCreateBrain: () => void;
  onSelectEntry: (entry: Entry) => void;
}

export default function HomeView({
  entries,
  brainCount,
  brainName,
  brainId,
  isPersonalBrain,
  stagedCount,
  onNavigate,
  onOpenCapture,
  onOpenCaptureWith,
  onCreateBrain,
  onSelectEntry,
}: HomeViewProps) {
  // Cutoff is captured once on mount — keeps the "this week" tally stable
  // across re-renders and satisfies the purity rule (no Date.now in render).
  const [cutoff] = useState(() => Date.now() - 7 * 24 * 60 * 60 * 1000);
  const thisWeekCount = useMemo(
    () =>
      entries.filter((e) => {
        if (!e.created_at) return false;
        const t = new Date(e.created_at).getTime();
        return !isNaN(t) && t >= cutoff;
      }).length,
    [entries, cutoff],
  );

  return (
    <div
      className="mx-auto w-full"
      style={{
        maxWidth: 720,
        padding: "32px 20px calc(96px + env(safe-area-inset-bottom, 0px))",
        display: "flex",
        flexDirection: "column",
        gap: 20,
      }}
    >
      <GreetingHero
        thisWeekCount={thisWeekCount}
        totalCount={entries.length}
        brainName={brainName}
      />

      <TodayCard entries={entries} onNavigate={onNavigate} />

      <InboxTriageCard stagedCount={stagedCount} />

      <FirstRunChecklist
        entryCount={entries.length}
        brainCount={brainCount}
        brainId={brainId}
        isPersonalBrain={isPersonalBrain}
        onNavigate={onNavigate}
        onOpenCapture={onOpenCapture}
        onCreateBrain={onCreateBrain}
      />

      <RecentCapturesStrip entries={entries} onSelectEntry={onSelectEntry} />

      <QuickCaptureChips onOpenCaptureWith={onOpenCaptureWith} />
    </div>
  );
}
