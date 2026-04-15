import { useState, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { extractNudgeText } from "../lib/extractNudgeText";
import { scoreEntriesForQuery } from "../lib/chatContext";
import { loadGraph } from "../lib/conceptGraph";
import { withGraphLock } from "../lib/graphWriter";
import { recordDecision } from "../lib/learningEngine";
import { getEmbedHeaders } from "../lib/aiSettings";
import { unlockVault, decryptVaultKeyFromRecovery, decryptEntry } from "../lib/crypto";
import { PROMPTS } from "../config/prompts";
import { getStoredPinHash } from "../lib/pin";
import type { Entry, Brain } from "../types";
import type { AIResponseBody, VaultData, DecryptedSecret } from "../lib/ai.types";

/**
 * Build a concept-graph context snippet for a chat query.
 * Finds concepts matching query terms and surfaces cross-concept
 * relationships that pure keyword/vector search would miss.
 */
function buildGraphContext(brainId: string, query: string, entries: Entry[]): string {
  const graph = loadGraph(brainId);
  if (graph.concepts.length === 0) return "";

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return "";

  // Find concepts matching query terms
  const matchedConcepts = graph.concepts.filter((c) =>
    terms.some((t) => c.label.toLowerCase().includes(t)),
  );
  if (matchedConcepts.length === 0) return "";

  const entryMap = new Map(entries.map((e) => [e.id, e]));
  const lines: string[] = [];

  // Surface concept relationships
  for (const concept of matchedConcepts.slice(0, 5)) {
    const relatedRels = graph.relationships.filter(
      (r) => r.source_concept === concept.id || r.target_concept === concept.id,
    );
    if (relatedRels.length > 0) {
      const relStrs = relatedRels.slice(0, 4).map((r) => {
        const other = r.source_concept === concept.id ? r.target_concept : r.source_concept;
        const otherConcept = graph.concepts.find((c) => c.id === other);
        return `${concept.label} --${r.relation}--> ${otherConcept?.label || other}`;
      });
      lines.push(...relStrs);
    }

    // Surface entries connected through this concept
    const entryTitles = concept.source_entries
      .slice(0, 4)
      .map((eid) => entryMap.get(eid)?.title)
      .filter(Boolean);
    if (entryTitles.length > 0) {
      lines.push(`"${concept.label}" connects: ${entryTitles.join(", ")}`);
    }
  }

  if (lines.length === 0) return "";
  return `\n\n<concept_graph>\n${lines.join("\n")}\n</concept_graph>`;
}

/**
 * Feed chat queries back into the concept graph.
 * If the user asks about concepts that already exist, boost their frequency.
 * This strengthens the graph based on what the user actually cares about.
 */
function feedQueryToGraph(brainId: string, query: string): void {
  const graph = loadGraph(brainId);
  if (graph.concepts.length === 0) return;

  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (terms.length === 0) return;

  let changed = false;
  for (const concept of graph.concepts) {
    if (terms.some((t) => concept.label.toLowerCase().includes(t))) {
      concept.frequency += 1;
      changed = true;
    }
  }
  if (changed) {
    withGraphLock(brainId, async () => {
      const { saveGraphToDB } = await import("../lib/conceptGraph");
      await saveGraphToDB(brainId, graph);
    });
  }
}

interface ChatLink {
  from?: string;
  to?: string;
  [key: string]: unknown;
}

const SECRET_QUERY_RE =
  /\b(password|passcode|passphrase|credentials|login|wifi\s*(key|password)|network\s*key|bank\s*(account|pin|number|detail)|credit\s*card|cvv|routing\s*number|secret|vault)\b/i;

function containsSensitiveContent(text: string): boolean {
  return SECRET_QUERY_RE.test(text);
}

interface UseChatParams {
  entries: Entry[];
  activeBrain: Brain | null;
  brains: Brain[];
  links: ChatLink[];
  cryptoKey: CryptoKey | null;
  handleVaultUnlock: (key: CryptoKey | null) => void;
  vaultExists: boolean;
}

export function useChat({
  entries,
  activeBrain,
  brains,
  links,
  cryptoKey,
  handleVaultUnlock,
  vaultExists,
}: UseChatParams) {
  const [chatInput, setChatInput] = useState("");
  const [searchAllBrains, setSearchAllBrains] = useState(false);
  const [chatMsgs, setChatMsgs] = useState([
    {
      role: "assistant",
      content:
        'Hey! Ask me about your memories — "What\'s my ID number?", "Who are my suppliers?", etc.',
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingCapture, setPendingCapture] = useState<string | null>(null);
  const [pendingSecureMsg, setPendingSecureMsg] = useState<{ content: string } | null>(null);
  const [showPinGate, setShowPinGate] = useState(false);
  const [pinGateIsSetup, setPinGateIsSetup] = useState(false);
  const [vaultUnlockModal, setVaultUnlockModal] = useState<{
    vaultData: VaultData;
    pendingMsg: string;
  } | null>(null);
  const [vaultModalInput, setVaultModalInput] = useState("");
  const [vaultModalMode, setVaultModalMode] = useState<"passphrase" | "recovery">("passphrase");
  const [vaultModalError, setVaultModalError] = useState("");
  const [vaultModalBusy, setVaultModalBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const sendChat = useCallback(
    async (msg: string, overrideSecrets?: DecryptedSecret[]) => {
      setChatLoading(true);
      try {
        const secrets: DecryptedSecret[] =
          overrideSecrets ||
          (cryptoKey
            ? entries
                .filter((e) => e.type === "secret")
                .map((e) => ({
                  title: e.title,
                  content: typeof e.content === "string" ? e.content.slice(0, 500) : undefined,
                  tags: e.tags,
                }))
            : []);

        const embedHeaders = getEmbedHeaders();
        // Build concept graph context for richer answers
        const graphCtx = activeBrain?.id ? buildGraphContext(activeBrain.id, msg, entries) : "";
        // Feed query back into the graph to boost frequently-asked concepts
        if (activeBrain?.id) {
          feedQueryToGraph(activeBrain.id, msg);
          recordDecision(activeBrain.id, {
            source: "chat",
            type: "CHAT_QUERY",
            action: "accept",
            field: "query",
            originalValue: msg,
          });
        }

        let data: AIResponseBody;
        if (embedHeaders && activeBrain?.id) {
          const history = chatMsgs.slice(-10);
          const isAllBrains = searchAllBrains && brains.length > 1;
          const keywordFallback = isAllBrains
            ? []
            : scoreEntriesForQuery(
                entries.map((e) => ({
                  id: e.id,
                  title: e.title,
                  type: e.type,
                  tags: e.tags || [],
                  content: typeof e.content === "string" ? e.content.slice(0, 200) : undefined,
                  metadata: e.metadata,
                })),
                msg,
              ).slice(0, 40);
          const brainParam = isAllBrains
            ? { brain_ids: brains.map((b) => b.id) }
            : { brain_id: activeBrain.id };
          // Append concept graph context to message so the server-side LLM sees it
          const enrichedMsg = graphCtx ? `${msg}\n\n[Concept graph context — use to surface cross-concept connections:]${graphCtx}` : msg;
          const res = await authFetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...embedHeaders },
            body: JSON.stringify({
              message: enrichedMsg,
              ...brainParam,
              history,
              secrets,
              ...(isAllBrains ? {} : { fallback_entries: keywordFallback }),
            }),
          });
          data = await res.json();
        } else {
          const relevantEntries = scoreEntriesForQuery(
            entries.map((e) => ({
              id: e.id,
              title: e.title,
              type: e.type,
              tags: e.tags || [],
              content: typeof e.content === "string" ? e.content.slice(0, 200) : undefined,
              metadata: e.metadata,
            })),
            msg,
          ).slice(0, 60);
          const contextWithSecrets = secrets.length
            ? [...relevantEntries, ...secrets.map((s) => ({ ...s, type: "secret" }))]
            : relevantEntries;
          // Include concept graph in system prompt for client-side path
          const systemPrompt = PROMPTS.CHAT.replace(
            "{{MEMORIES}}",
            JSON.stringify(contextWithSecrets),
          ).replace("{{LINKS}}", JSON.stringify(links)) + graphCtx;
          const res = await callAI({
            max_tokens: 1000,
            system: systemPrompt,
            brainId: activeBrain?.id,
            messages: [{ role: "user", content: msg }],
          });
          data = (await res.json()) as AIResponseBody;
        }
        // Surface actual API errors instead of generic "Couldn't process"
        const errorMsg = typeof data.error === "string"
          ? data.error
          : (data.error as any)?.message;
        const rawContent = errorMsg
          ? `Sorry, something went wrong: ${errorMsg}`
          : extractNudgeText(data) ||
            data.content?.map((c) => c.text || "").join("") ||
            "Couldn't process.";
        // Extract [NO_INFO:topic] tag if present
        const noInfoMatch = rawContent.match(/\[NO_INFO:([^\]]+)\]\s*$/);
        const content = noInfoMatch ? rawContent.replace(noInfoMatch[0], "").trimEnd() : rawContent;
        if (noInfoMatch) setPendingCapture(noInfoMatch[1].trim());
        if (containsSensitiveContent(content)) {
          const hasPinSet = !!getStoredPinHash();
          setPendingSecureMsg({ content });
          setPinGateIsSetup(!hasPinSet);
          setShowPinGate(true);
        } else {
          setChatMsgs((p) => [...p, { role: "assistant", content }]);
        }
      } catch {
        setChatMsgs((p) => [...p, { role: "assistant", content: "Connection error." }]);
      }
      setChatLoading(false);
    },
    [cryptoKey, entries, links, chatMsgs, activeBrain, searchAllBrains, brains],
  );

  const handleChat = useCallback(async () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMsgs((p) => [...p, { role: "user", content: msg }]);

    if (!cryptoKey && vaultExists && SECRET_QUERY_RE.test(msg)) {
      try {
        const r = await authFetch("/api/vault");
        const vd = r.ok ? await r.json() : null;
        if (vd?.exists) {
          setVaultUnlockModal({ vaultData: vd, pendingMsg: msg });
          setVaultModalInput("");
          setVaultModalMode("passphrase");
          setVaultModalError("");
          setChatMsgs((p) => [
            ...p,
            {
              role: "assistant",
              content:
                "🔐 That looks like a question about your vault secrets. Please unlock your vault to continue.",
            },
          ]);
          return;
        }
      } catch {
        // vault check failed, proceed without vault
      }
    }

    await sendChat(msg);
  }, [chatInput, cryptoKey, vaultExists, sendChat]);

  const handleVaultModalUnlock = useCallback(async () => {
    if (!vaultUnlockModal || !vaultModalInput.trim()) return;
    setVaultModalBusy(true);
    setVaultModalError("");
    const { vaultData, pendingMsg } = vaultUnlockModal;
    try {
      let key: CryptoKey | null;
      if (vaultModalMode === "passphrase") {
        key = await unlockVault(vaultModalInput, vaultData.salt, vaultData.verify_token);
      } else {
        key = await decryptVaultKeyFromRecovery(
          vaultData.recovery_blob,
          vaultModalInput.trim().toUpperCase(),
        );
      }
      if (!key) {
        setVaultModalError(
          vaultModalMode === "passphrase" ? "Wrong passphrase" : "Wrong recovery key",
        );
        setVaultModalBusy(false);
        return;
      }
      handleVaultUnlock(key);
      setVaultUnlockModal(null);
      const decryptedEntries = await Promise.all(
        entries
          .filter((e) => e.type === "secret")
          .map(
            (e) =>
              decryptEntry(
                e as unknown as { content?: string; [k: string]: unknown },
                key!,
              ) as unknown as Promise<Entry>,
          ),
      );
      const secrets: DecryptedSecret[] = decryptedEntries.map((e) => ({
        title: e.title,
        content: typeof e.content === "string" ? e.content.slice(0, 500) : undefined,
        tags: e.tags,
      }));
      await sendChat(pendingMsg, secrets);
    } catch {
      setVaultModalError("Unlock failed");
    }
    setVaultModalBusy(false);
  }, [vaultUnlockModal, vaultModalInput, vaultModalMode, handleVaultUnlock, entries, sendChat]);

  return {
    chatInput,
    setChatInput,
    searchAllBrains,
    setSearchAllBrains,
    chatMsgs,
    setChatMsgs,
    chatLoading,
    pendingCapture,
    setPendingCapture,
    pendingSecureMsg,
    setPendingSecureMsg,
    showPinGate,
    setShowPinGate,
    pinGateIsSetup,
    vaultUnlockModal,
    setVaultUnlockModal,
    vaultModalInput,
    setVaultModalInput,
    vaultModalMode,
    setVaultModalMode,
    vaultModalError,
    vaultModalBusy,
    chatEndRef,
    sendChat,
    handleChat,
    handleVaultModalUnlock,
  };
}
