// main.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const TOKEN = Deno.env.get("BOT_TOKEN");
const ADMIN_ID = 7171269159;
const CHANNELS = ["@MasakoffVpns"];
const SECRET_PATH = "/testinstadownload"; // change this
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;
const API_URL = "https://api2.haji-api.ir/proDL?url={link}";
const SUPPORTED_PLATFORMS = new RegExp("(https?://)?(www\\.)?(youtube\\.com/watch\\?v=|youtu\\.be/|tiktok\\.com/|instagram\\.com/|twitter\\.com/|x\\.com/)", "i");
let botUsername: string | undefined;

async function fetchDownloadInfo(link: string): Promise<{ title: string; thumbnail: string | null; downloads: { quality: string; url: string }[] }> {
  try {
    const url = API_URL.replace("{link}", encodeURIComponent(link));
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`API error: ${res.status}`);
    }
    const data = await res.json();
    if (data.status !== "success") {
      throw new Error("API returned failure");
    }
    // Assuming structure: {"status": "success", "title": "Title", "thumbnail": "url", "downloads": [{"quality": "HD", "url": "dl_url"}, ...]}
    return {
      title: data.title || "Unknown Title",
      thumbnail: data.thumbnail || null,
      downloads: data.downloads || [],
    };
  } catch (e) {
    console.error(e);
    throw e;
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
  const text = message?.text?.trim();
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
            text: "Merhaba! Ben bir sosyal medya downloader botuyum. TikTok, Instagram, Twitter veya YouTube linki gönder, indireyim! 😎\nÖrnek: https://www.youtube.com/watch?v=example\n/help için yardım al.",
            parse_mode: "HTML"
          })
        });
      } else {
        const inline_keyboard = [
          ...CHANNELS.map(ch => [{ text: "📢 Kanala abone ol", url: `https://t.me/${ch.replace("@", "")}` }]),
          [{ text: "✅ Kontrol et", callback_data: "check_sub" }]
        ];
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "🔒 Botu kullanmak için kanala abone ol.",
            reply_markup: { inline_keyboard },
            parse_mode: "HTML"
          })
        });
      }
    } else if (text === "/help") {
      const help_text = (
        "<b>Yardım Menüsü</b>\n\n" +
        "- Link gönder: Otomatik algılayıp indirme seçenekleri sunarım.\n" +
        "- Desteklenen platformlar: YouTube, TikTok, Instagram, Twitter (X).\n" +
        "- Görsel önizleme ve butonlarla indirme linkleri sağlarım.\n" +
        "- Hata olursa, bana söyle! 🚀"
      );
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: help_text,
          parse_mode: "HTML"
        })
      });
    } else if (data === "check_sub" && messageId) {
      const subscribed = await isSubscribed(userId);
      if (subscribed) {
        await fetch(`${TELEGRAM_API}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: "✅ Abone oldun! Şimdi link gönder:",
            parse_mode: "HTML"
          })
        });
      }
      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callbackQuery.id,
          text: subscribed ? "" : "❌ Henüz abone değilsin",
          show_alert: false
        })
      });
    } else if (text && SUPPORTED_PLATFORMS.test(text)) {
      const subscribed = await isSubscribed(userId);
      if (!subscribed) {
        const inline_keyboard = [
          ...CHANNELS.map(ch => [{ text: "📢 Kanala abone ol", url: `https://t.me/${ch.replace("@", "")}` }]),
          [{ text: "✅ Kontrol et", callback_data: "check_sub" }]
        ];
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: "🔒 Botu kullanmak için kanala abone ol.",
            reply_markup: { inline_keyboard },
            parse_mode: "HTML"
          })
        });
        return new Response("OK", { status: 200 });
      }
      const link = text;
      const waitRes = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "⏳ Alınıyor, lütfen bekleyin...",
          parse_mode: "HTML"
        })
      });
      const waitJson = await waitRes.json();
      const waitId = waitJson.result.message_id;
      try {
        const { title, thumbnail, downloads } = await fetchDownloadInfo(link);
        if (downloads.length === 0) {
          await fetch(`${TELEGRAM_API}/editMessageText`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: waitId,
              text: "İndirme linki bulunamadı. 😔",
              parse_mode: "HTML"
            })
          });
          return new Response("OK", { status: 200 });
        }
        const inline_keyboard = [
          ...downloads.map(dl => [{ text: `Download ${dl.quality || "Unknown"}`, url: dl.url }]),
          [{ text: "🤝 Arkadaşlarınla paylaş", switch_inline_query: "Sosyal medya downloader bot 🔥" }]
        ];
        if (!botUsername) {
          const meRes = await fetch(`${TELEGRAM_API}/getMe`);
          const meJson = await meRes.json();
          botUsername = meJson.result.username;
        }
        const caption = `<b>${title}</b>\nİndirme seçenekleri aşağıda! 🎥\n\nBot: @${botUsername}`;
        if (thumbnail) {
          await fetch(`${TELEGRAM_API}/sendPhoto`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              photo: thumbnail,
              caption,
              reply_markup: { inline_keyboard },
              parse_mode: "HTML"
            })
          });
        } else {
          await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: chatId,
              text: caption,
              reply_markup: { inline_keyboard },
              parse_mode: "HTML"
            })
          });
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
        await fetch(`${TELEGRAM_API}/editMessageText`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: waitId,
            text: "Bir hata oluştu. Lütfen tekrar dene veya farklı link dene. ⚠️",
            parse_mode: "HTML"
          })
        });
        if (ADMIN_ID) {
          await fetch(`${TELEGRAM_API}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: ADMIN_ID,
              text: `⚠️ Hata: ${e}\nKullanıcı: ${chatId}`,
              parse_mode: "HTML"
            })
          });
        }
        console.error(e);
      }
    } else if (text) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Geçerli bir link gibi görünmüyor. Lütfen TikTok, Instagram, Twitter veya YouTube linki gönder. ❌",
          parse_mode: "HTML"
        })
      });
    }
  } catch (e) {
    console.error(e);
    if (ADMIN_ID) {
      await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text: `⚠️ Bot hatası!\nSebep: ${e}`,
          parse_mode: "HTML"
        })
      });
    }
  }
  return new Response("OK", { status: 200 });
});
