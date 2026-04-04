// test-secret.ts
const BOT_TOKEN = Deno.env.get("BOT_TOKEN");

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is missing!");
  Deno.exit(1);
}

const chatId = 1449060258; // Replace with your Telegram numeric ID
const text = "Secret test message";

try {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
  });

  const result = await res.json();
  console.log("Telegram API result:", result);
} catch (err) {
  console.error("Fetch error:", err);
}