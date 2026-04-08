import { useState, useCallback, useRef } from "react";
import { authFetch } from "../lib/authFetch";
import { callAI } from "../lib/ai";
import { extractNudgeText } from "../lib/extractNudgeText";
import { scoreEntriesForQuery } from "../lib/chatContext";
import {
  getEmbedHeaders,
  getUserProvider,
  getUserModel,
  getUserApiKey,
  getOpenRouterKey,
  getOpenRouterModel,
} from "../lib/aiSettings";
import { unlockVault, decryptVaultKeyFromRecovery, decryptEntry } from "../lib/crypto";
import { PROMPTS } from "../config/prompts";
import { getStoredPinHash } from "../lib/pin";
import type { Entry, Brain } from "../types";

const SECRET_QUERY_RE =
  /\b(password|passcode|passphrase|credentials|login|wifi\s*(key|password)|network\s*key|bank\s*(account|pin|number|detail)|credit\s*card|cvv|routing\s*number|secret|vault)\b/i;

function containsSensitiveContent(text: string): boolean {
  return SECRET_QUERY_RE.test(text);
}

interface UseChatParams {
  entries: Entry[];
  activeBrain: Brain | null;
  brains: Brain[];
  links: any[];
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
  const [pendingSecureMsg, setPendingSecureMsg] = useState<{ content: string } | null>(null);
  const [showPinGate, setShowPinGate] = useState(false);
  const [pinGateIsSetup, setPinGateIsSetup] = useState(false);
  const [vaultUnlockModal, setVaultUnlockModal] = useState<{
    vaultData: any;
    pendingMsg: string;
  } | null>(null);
  const [vaultModalInput, setVaultModalInput] = useState("");
  const [vaultModalMode, setVaultModalMode] = useState<"passphrase" | "recovery">("passphrase");
  const [vaultModalError, setVaultModalError] = useState("");
  const [vaultModalBusy, setVaultModalBusy] = useState(false);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const sendChat = useCallback(
    async (msg: string, overrideSecrets?: any[]) => {
      setChatLoading(true);
      try {
        const secrets =
          overrideSecrets ||
          (cryptoKey
            ? entries
                .filter((e) => e.type === "secret")
                .map((e) => ({ title: e.title, content: (e.content as any)?.slice(0, 500), tags: e.tags }))
            : []);

        const embedHeaders = getEmbedHeaders();
        let data: any;
        if (embedHeaders && activeBrain?.id) {
          const provider = getUserProvider();
          const genKey = provider === "openrouter" ? getOpenRouterKey() : getUserApiKey();
          const model = provider === "openrouter" ? getOpenRouterModel() : getUserModel();
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
                  content: e.content ? (e.content as any).slice(0, 200) : undefined,
                })),
                msg,
              ).slice(0, 40);
          const brainParam = isAllBrains
            ? { brain_ids: brains.map((b) => b.id) }
            : { brain_id: activeBrain.id };
          const res = await authFetch("/api/chat", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...embedHeaders,
              ...(genKey ? { "X-User-Api-Key": genKey } : {}),
            },
            body: JSON.stringify({
              message: msg,
              ...brainParam,
              history,
              provider,
              model,
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
              content: e.content ? (e.content as any).slice(0, 200) : undefined,
            })),
            msg,
          ).slice(0, 60);
          const contextWithSecrets = secrets.length
            ? [...relevantEntries, ...secrets.map((s) => ({ ...s, type: "secret" }))]
            : relevantEntries;
          const res = await callAI({
            max_tokens: 1000,
            system: PROMPTS.CHAT.replace("{{MEMORIES}}", JSON.stringify(contextWithSecrets)).replace(
              "{{LINKS}}",
              JSON.stringify(links),
            ),
            brainId: activeBrain?.id,
            messages: [{ role: "user", content: msg }],
          });
          data = await (res as any).json();
        }
        const content =
          extractNudgeText(data) ||
          data.content?.map((c: any) => c.text || "").join("") ||
          "Couldn't process.";
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
      let key: CryptoKey;
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
        entries.filter((e) => e.type === "secret").map((e) => decryptEntry(e, key)),
      );
      const secrets = decryptedEntries.map((e: any) => ({
        title: e.title,
        content: e.content?.slice(0, 500),
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
