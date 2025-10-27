// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TOKEN = Deno.env.get("BOT_TOKEN");
const ADMIN_ID = 7171269159;
const CHANNELS = ["@MasakoffVpns"];
const SECRET_PATH = "/testinstadownload"; // change this
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

let botUsername: string | undefined;

async function getInstagramVideoUrl(instUrl: string): Promise<string | null> {
  const match = instUrl.match(/\/(p|reel)\/([^/?]+)/);
  if (!match) {
    // For stories, not supported yet
    return null;
  }
  const shortcode = match[2];

  const graphql = new URL("https://www.instagram.com/api/graphql");
  graphql.searchParams.set("variables", JSON.stringify({ shortcode }));
  graphql.searchParams.set("doc_id", "10015901848480474");
  graphql.searchParams.set("lsd", "AVqbxe3J_YA");

  try {
    const res = await fetch(graphql.toString(), {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-IG-App-ID": "936619743392459",
        "X-FB-LSD": "AVqbxe3J_YA",
        "X-ASBD-ID": "129477",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const videoUrl = json?.data?.xdt_shortcode_media?.video_url;
    return videoUrl || null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

serve(async (req: Request) => {
  const { pathname } = new URL(req.url);
  if (pathname !== SECRET_PATH) {
    return new Response("Bot is running.", { status: 200 });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const update = await req.json();
  const message = update.message;
  const callbackQuery = update.callback_query;
  if (!message && !callbackQuery) {
    return new Response("OK", { status: 200 });
  }

  const chatId = message?.chat.id || callbackQuery?.message.chat.id;
  const userId = message?.from.id || callbackQuery?.from_user.id;
  const text = message?.text;
  const data = callbackQuery?.data;
  const messageId = callbackQuery?.message?.message_id;

  if (!chatId || !userId) return new Response("OK", { status: 200 });

  // Function to check subscription
  async function isSubscribed(uid: number): Promise<boolean> {
    for (const channel of CHANNELS) {
      try {
        const res = await fetch(`${TELEGRAM_API}/getChatMember?chat_id=${channel}&user_id=${uid}`);
        const d = await res.json();
        if (!d.ok) return false;
        const status = d.result.status;
        if (!["member", "administrator", "creator"].includes(status)) return false;
      } catch (e) {
        console.error(e);
        return false;
      }
    }
    return true;
  }

  try {
    if (text?.startsWith("/start")) {
      const subscribed = await isSubscribed(userId);
      if (subscribed) {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "📎 Menana Instagram linkini ugrat (post, reels, story).",
            parse_mode: "HTML"
          })
        });
      } else {
        const inline_keyboard = [
          ...CHANNELS.map(ch => [{ text: "📢 Kanala agza bol", url: `https://t.me/${ch.replace("@", "")}` }]),
          [{ text: "✅ Barlamak", callback_data: "check_sub" }]
        ];
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "🔒 Botdan peydalanmak ucin kanala agza bol.",
            reply_markup: { inline_keyboard },
            parse_mode: "HTML"
          })
        });
      }
    } else if (data === "check_sub" && messageId) {
      const subscribed = await isSubscribed(userId);
      if (subscribed) {
        await fetch(`${TELEGRAM_API}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: "✅ Agza boldin! Indi link ugrat:",
            parse_mode: "HTML"
          })
        });
      }
      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQuery.id,
          text: subscribed ? "" : "❌ Hazir hem agza dal",
          show_alert: false
        })
      });
    } else if (text && text.includes("instagram.com")) {
      const subscribed = await isSubscribed(userId);
      if (!subscribed) {
        const inline_keyboard = [
          ...CHANNELS.map(ch => [{ text: "📢 Kanala agza bol", url: `https://t.me/${ch.replace("@", "")}` }]),
          [{ text: "✅ Barlamak", callback_data: "check_sub" }]
        ];
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "🔒 Botdan peydalanmak ucin kanala agza bol.",
            reply_markup: { inline_keyboard },
            parse_mode: "HTML"
          })
        });
        return new Response("OK", { status: 200 });
      }

      const url = text.trim();
      const waitRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "⏳ Alynmokda, garasyn...",
          parse_mode: "HTML"
        })
      });
      const waitJson = await waitRes.json();
      const waitId = waitJson.result.message_id;

      try {
        const videoUrl = await getInstagramVideoUrl(url);
        if (!videoUrl) {
          throw new Error("Could not extract video URL. Stories may not be supported yet.");
        }

        if (!botUsername) {
          const meRes = await fetch(`${TELEGRAM_API}/getMe`);
          const meJson = await meRes.json();
          botUsername = meJson.result.username;
        }

        const markup = {
          inline_keyboard: [
            [{ text: "🤝 Dostlaryna paylas", switch_inline_query: "Instagram video download bot 🔥" }]
          ]
        };

        await fetch(`${TELEGRAM_API}/sendVideo`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            video: videoUrl,
            caption: `📥 Alyndy!\n\nBot: @${botUsername}`,
            reply_markup: markup,
            parse_mode: "HTML"
          })
        });

        await fetch(`${TELEGRAM_API}/deleteMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: waitId
          })
        });
      } catch (e) {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "⚠️ Yalnyslyk cykdy, sonrak barlap gor.",
            parse_mode: "HTML"
          })
        });

        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: ADMIN_ID,
            text: `⚠️ Yalnyslyk: ${e}\nFoydalanuvchi: ${chatId}`,
            parse_mode: "HTML"
          })
        });
        console.error(e);
      }
    }
  } catch (e) {
    console.error(e);
    if (ADMIN_ID) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text: `⚠️ Bot durdy!\nSabab: ${e}`,
          parse_mode: "HTML"
        })
      });
    }
  }

  return new Response("OK", { status: 200 });
});