import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { APPS, appForAddress } from "./apps";

// Reads team-app notification emails from Gmail over IMAP.
// GMAIL_USER + GMAIL_APP_PASSWORD (a Google "app password", not the normal one).
export function emailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

// The "View message" style link inside the email, if it points back at the app.
function appLink(html, app) {
  if (!html) return null;
  for (const [, href] of html.matchAll(/href="([^"]+)"/gi)) {
    const url = href.replace(/&amp;/g, "&");
    try {
      const host = new URL(url).hostname;
      if (app.domains.some((d) => host === d || host.endsWith(`.${d}`)) && !/unsubscribe|preferences|settings/i.test(url)) {
        return url;
      }
    } catch {}
  }
  return null;
}

function snippet(text = "") {
  // Drop the "[https://...]" link targets the HTML-to-text conversion leaves behind.
  return text.replace(/\[https?:\/\/[^\]]+\]/g, "").replace(/\s+/g, " ").trim().slice(0, 600);
}

export async function loadNotifications({ days = 14, limit = 40 } = {}) {
  if (!emailConfigured()) return [];
  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });
  await client.connect();
  const out = [];
  // "All Mail" has a different name in non-English Gmail, so find it by its special-use flag.
  const boxes = await client.list();
  const allMail = boxes.find((b) => b.specialUse === "\\All")?.path || "INBOX";
  const lock = await client.getMailboxLock(allMail);
  try {
    const since = new Date(Date.now() - days * 864e5);
    const domains = APPS.flatMap((a) => a.domains);
    const uids = await client.search({ since, or: domains.map((d) => ({ from: d })) }, { uid: true });
    const recent = (uids || []).slice(-limit);
    if (recent.length) {
      for await (const m of client.fetch(recent, { source: true, flags: true }, { uid: true })) {
        const mail = await simpleParser(m.source);
        const from = mail.from?.value?.[0] || {};
        const app = appForAddress(from.address);
        if (!app) continue;
        out.push({
          id: `email-${m.uid}`,
          kind: "email",
          source: app.name,
          title: mail.subject || "(no subject)",
          author: from.name || from.address,
          text: snippet(mail.text),
          at: (mail.date || new Date()).toISOString(),
          unread: !m.flags?.has("\\Seen"),
          openUrl: appLink(mail.html, app) || app.openUrl,
          replyTo: mail.replyTo?.value?.[0]?.address || null,
        });
      }
    }
  } finally {
    lock.release();
    await client.logout().catch(() => {});
  }
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
