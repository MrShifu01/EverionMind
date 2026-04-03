import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const TELEGRAM_SECRET = Deno.env.get("TELEGRAM_SECRET_TOKEN") || "";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const supabase = createClient(SB_URL, SB_SERVICE_KEY);

async function telegramReply(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
}

async function classifyMessage(text: string, memoryGuide: string): Promise<Record<string, unknown>> {
  const system = memoryGuide
    ? `[Classification Guide]\n${memoryGuide}\n\n[Task]\nClassify and structure this into an OpenBrain entry. Return ONLY valid JSON: {title,content,type,tags,metadata,importance}`
    : `Classify and structure this into an OpenBrain entry. Return ONLY valid JSON: {title,content,type,tags,metadata,importance}`;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5-20251001", max_tokens: 400, system, messages: [{ role: "user", content: text }] }),
  });
  const data = await res.json();
  const raw = (data.content?.[0]?.text || "{}").replace(/```json|```/g, "").trim();
  try { return JSON.parse(raw); } catch { return { title: text.slice(0, 80), content: text, type: "note", tags: ["telegram"], metadata: {}, importance: 0 }; }
}

serve(async (req) => {
  const url = new URL(req.url);

  // Telegram webhook verification
  if (TELEGRAM_SECRET) {
    const secret = req.headers.get("x-telegram-bot-api-secret-token");
    if (secret !== TELEGRAM_SECRET) return new Response("Unauthorized", { status: 401 });
  }

  if (req.method !== "POST") return new Response("OK");

  try {
    const body = await req.json();
    const msg = body.message || body.edited_message;
    if (!msg) return new Response("OK");

    const chatId: number = msg.chat.id;
    const text: string = msg.text || "";
    const platformUserId = String(chatId);

    // Handle pending link code
    if (/^[A-Z0-9]{6}$/.test(text.trim())) {
      const code = text.trim();
      const { data: link } = await supabase
        .from("messaging_pending_links")
        .select("*")
        .eq("code", code)
        .eq("platform", "telegram")
        .gt("expires_at", new Date().toISOString())
        .single();

      if (link) {
        await supabase.from("messaging_connections").upsert({ user_id: link.user_id, brain_id: link.brain_id, platform: "telegram", platform_user_id: platformUserId });
        await supabase.from("messaging_pending_links").delete().eq("id", link.id);
        await telegramReply(chatId, "✅ Connected! Send me anything to save it to your brain.");
        return new Response("OK");
      }
    }

    // Handle commands
    if (text === "/help") {
      await telegramReply(chatId, "OpenBrain Bot\n\nJust send me any text, photo, or voice note and I'll save it.\n\n/list — show last 5 entries\n/help — this message\n\nTo connect: Settings → Messaging in the app.");
      return new Response("OK");
    }

    // Look up connection
    const { data: conn } = await supabase.from("messaging_connections").select("user_id, brain_id").eq("platform", "telegram").eq("platform_user_id", platformUserId).single();
    if (!conn) {
      await telegramReply(chatId, "To connect this chat to your OpenBrain, open the app → Settings → Messaging and follow the link.");
      return new Response("OK");
    }

    if (text === "/list") {
      const { data: entries } = await supabase.from("entries").select("title,type,created_at").eq("brain_id", conn.brain_id).order("created_at", { ascending: false }).limit(5);
      const list = (entries || []).map((e, i) => `${i + 1}. ${e.title} (${e.type})`).join("\n") || "No entries yet.";
      await telegramReply(chatId, `Your last entries:\n${list}`);
      return new Response("OK");
    }

    if (!text) { await telegramReply(chatId, "Send me text to save it. Photos and voice notes coming soon."); return new Response("OK"); }

    // Fetch user memory guide
    const { data: mem } = await supabase.from("user_memory").select("content").eq("user_id", conn.user_id).single();
    const memoryGuide = mem?.content || "";

    // Classify and save
    const parsed = await classifyMessage(text, memoryGuide);
    const entry = { id: crypto.randomUUID(), brain_id: conn.brain_id, title: String(parsed.title || text.slice(0, 80)), content: String(parsed.content || text), type: String(parsed.type || "note"), tags: [...(Array.isArray(parsed.tags) ? parsed.tags : []), "telegram"], metadata: { ...(parsed.metadata || {}), source: "telegram" }, importance: Number(parsed.importance) || 0, created_at: new Date().toISOString() };
    await supabase.from("entries").insert(entry);
    await telegramReply(chatId, `✓ Saved: ${entry.title} (${entry.type})`);
  } catch (e) {
    console.error(e);
  }

  return new Response("OK");
});
