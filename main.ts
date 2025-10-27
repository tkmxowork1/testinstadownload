// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TOKEN = Deno.env.get("BOT_TOKEN");
const ADMIN_ID = 7171269159;
const CHANNELS = ["@MasakoffVpns"];
const SECRET_PATH = "/testinstadownload"; // change this
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

let botUsername: string | undefined;

async function getInstagramPostMedia(instUrl: string): Promise<Array<{type: string, url: string}> | null> {
  const match = instUrl.match(/\/(p|reel)\/([^/?]+)/);
  if (!match) {
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
    const media = json?.data?.xdt_shortcode_media;
    if (!media) return null;

    const mediaList: Array<{type: string, url: string}> = [];

    if (media.__typename === "GraphVideo") {
      if (media.video_url) mediaList.push({ type: "video", url: media.video_url });
    } else if (media.__typename === "GraphImage") {
      if (media.display_url) mediaList.push({ type: "photo", url: media.display_url });
    } else if (media.__typename === "GraphSidecar") {
      const edges = media.edge_sidecar_to_children?.edges || [];
      for (const edge of edges) {
        const node = edge.node;
        if (node.__typename === "GraphVideo" && node.video_url) {
          mediaList.push({ type: "video", url: node.video_url });
        } else if (node.__typename === "GraphImage" && node.display_url) {
          mediaList.push({ type: "photo", url: node.display_url });
        }
      }
    }

    return mediaList.length > 0 ? mediaList : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

async function getInstagramStoryMedia(instUrl: string): Promise<Array<{type: string, url: string}> | null> {
  const match = instUrl.match(/\/stories\/([^/]+)\/(\d+)/);
  if (!match) return null;
  const username = match[1];
  const storyId = match[2];

  const profileUrl = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`;

  try {
    const profileRes = await fetch(profileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "X-IG-App-ID": "936619743392459",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    if (!profileRes.ok) return null;
    const profileJson = await profileRes.json();
    const userId = profileJson?.data?.user?.id;
    if (!userId) return null;

    const storiesUrl = `https://i.instagram.com/api/v1/feed/reels_media/?reel_ids=${userId}`;
    const storiesRes = await fetch(storiesUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "X-IG-App-ID": "936619743392459",
        "Sec-Fetch-Site": "same-origin",
      },
    });
    if (!storiesRes.ok) return null;
    const storiesJson = await storiesRes.json();
    const reel = storiesJson.reels?.[userId];
    if (!reel) return null;

    const mediaList: Array<{type: string, url: string}> = [];

    for (const item of reel.items) {
      if (item.pk !== storyId) continue;
      if (item.media_type === 2 && item.video_versions?.[0]?.url) { // video
        mediaList.push({ type: "video", url: item.video_versions[0].url });
      } else if (item.media_type === 1 && item.image_versions2?.candidates?.[0]?.url) { // photo
        mediaList.push({ type: "photo", url: item.image_versions2.candidates[0].url });
      }
    }

    return mediaList.length > 0 ? mediaList : null;
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
  const userId = message?.from.id || callbackQuery?.from.id;
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
        let mediaList = await getInstagramPostMedia(url);
        if (!mediaList) {
          mediaList = await getInstagramStoryMedia(url);
        }
        if (!mediaList) {
          throw new Error("Could not extract media URLs.");
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

        for (let i = 0; i < mediaList.length; i++) {
          const media = mediaList[i];
          const isLast = i === mediaList.length - 1;
          const body = {
            chat_id: chatId,
            caption: `📥 Alyndy!\n\nBot: @${botUsername}`,
            parse_mode: "HTML",
            reply_markup: isLast ? markup : undefined,
          };

          if (media.type === "video") {
            await fetch(`${TELEGRAM_API}/sendVideo`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, video: media.url })
            });
          } else if (media.type === "photo") {
            await fetch(`${TELEGRAM_API}/sendPhoto`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...body, photo: media.url })
            });
          }
        }

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