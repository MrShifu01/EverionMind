import ProvidersTab from "./ProvidersTab";
import EnrichmentTab from "./EnrichmentTab";
import type { Brain } from "../../types";

interface GapDetail { id: string; title: string; gaps: string[] }

interface Props {
  activeBrain?: Brain;
  unenrichedDetails: GapDetail[];
  enriching: boolean;
  enrichProgress: { done: number; total: number } | null;
  runBulkEnrich: () => Promise<void>;
}

export default function AITab({ activeBrain, unenrichedDetails, enriching, enrichProgress, runBulkEnrich }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 36 }}>
      <div>
        <div className="micro" style={{ marginBottom: 16 }}>Providers</div>
        <ProvidersTab activeBrain={activeBrain} />
      </div>
      <div>
        <div className="micro" style={{ marginBottom: 16 }}>Enrichment</div>
        <EnrichmentTab
          unenrichedDetails={unenrichedDetails}
          enriching={enriching}
          enrichProgress={enrichProgress}
          runBulkEnrich={runBulkEnrich}
        />
      </div>
    </div>
  );
}
