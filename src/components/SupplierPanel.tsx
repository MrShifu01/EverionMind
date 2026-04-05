import { useMemo, type JSX } from "react";
import { useTheme } from "../ThemeContext";
import { TC } from "../data/constants";
import { extractPhone, toWaUrl } from "../lib/phone";
import type { Entry } from "../types";

interface SupplierPanelProps {
  entries: Entry[];
  onSelect: (entry: Entry) => void;
  onReorder: (entry: Entry) => void;
}

export default function SupplierPanel({ entries, onSelect, onReorder }: SupplierPanelProps): JSX.Element | null {
  const { t } = useTheme();
  const suppliers = useMemo(() =>
    entries.filter(e => e.tags?.includes("supplier") || e.metadata?.category === "supplier"),
    [entries]
  );
  const withPrice = suppliers.filter(s => s.metadata?.price);
  const abtn = (color: string): React.CSSProperties => ({ padding: "5px 12px", borderRadius: 20, border: `1px solid ${color}40`, background: `${color}15`, color, fontSize: 11, fontWeight: 600, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 });

  if (suppliers.length === 0) return (
    <p style={{ textAlign: "center", color: "#555", marginTop: 40, fontSize: 14 }}>No suppliers yet — add entries tagged "supplier".</p>
  );

  return (
    <div>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#666" }}>{suppliers.length} supplier{suppliers.length !== 1 ? "s" : ""}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {suppliers.map(s => {
          const phone = extractPhone(s);
          const cfg = TC[s.type] || TC.note;
          const price = s.metadata?.price ? `${s.metadata.price}${s.metadata.unit ? " " + s.metadata.unit : ""}` : null;
          return (
            <div key={s.id} style={{ background: t.surface, borderRadius: 12, padding: "16px 20px", border: `1px solid ${t.border}` }}>
              <div onClick={() => onSelect(s)} style={{ cursor: "pointer", marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{cfg.i}</span>
                  <span style={{ fontSize: 15, fontWeight: 600, color: t.text }}>{s.title}</span>
                  {price && <span style={{ fontSize: 11, color: t.accent, background: `${t.accent}15`, padding: "2px 8px", borderRadius: 20 }}>{price}</span>}
                </div>
                <p style={{ margin: 0, fontSize: 12, color: "#999", lineHeight: 1.4 }}>{s.content}</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {phone && <a href={`tel:${phone}`} style={abtn(t.accent)}>📞 Call</a>}
                {phone && <a href={toWaUrl(phone)} target="_blank" rel="noreferrer" style={abtn("#25D366")}>💬 WhatsApp</a>}
                <button onClick={() => onReorder(s)} style={abtn("#FF6B35")}>🔁 Reorder</button>
              </div>
            </div>
          );
        })}
      </div>
      {withPrice.length > 0 && (
        <div style={{ marginTop: 28, padding: "16px 20px", background: t.surface, borderRadius: 12, border: `1px solid ${t.border}` }}>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: t.textMuted, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Cost Summary</p>
          {withPrice.map(s => (
            <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0", borderBottom: "1px solid #2a2a4a20" }}>
              <span style={{ color: "#ccc" }}>{s.title}</span>
              <span style={{ color: t.accent, fontWeight: 600 }}>{s.metadata!.price}{s.metadata!.unit ? " " + s.metadata!.unit : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
