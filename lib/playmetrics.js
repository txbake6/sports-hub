// PlayMetrics has no public API. This uses the same private endpoints app.playmetrics.com uses,
// signed in as you (worked out from captures of the website on 2026-10-05). Any update can break it.
const API = process.env.PLAYMETRICS_API_URL || "https://api.playmetrics.com"; // overridable for local testing
export const PM_COOKIE = "sh_playmetrics";

async function pm(session, path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://app.playmetrics.com",
      "firebase-token": session.idToken,
      ...(session.accessKey ? { "pm-access-key": session.accessKey } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error("PlayMetrics sign-in expired"), { status: 401 });
  if (!res.ok) throw new Error(`PlayMetrics ${res.status}`);
  return res.json();
}

const threadUid = (team) => `team_${team.club_id}_${team.id}`;

const toMessage = (m) => ({
  id: m.id,
  author: m.sender?.name || "",
  text: m.text || "",
  images: m.custom_data?.attachment?.url && /^image\//.test(m.custom_data.attachment.content_type || "") ? [m.custom_data.attachment.url] : [],
  at: m.created_at,
  likes: Object.values(m.custom_data?.reactions || {}).reduce((n, r) => n + Object.keys(r || {}).length, 0),
});

// One feed entry per team chat (with its latest message), plus club announcements.
export async function loadPlaymetricsFeed(session) {
  const teams = ((await pm(session, "/user/teams")) || []).filter((t) => !t.archived);
  const chats = await Promise.all(
    teams.map(async (team) => {
      const uid = threadUid(team);
      const msgs = await pm(session, `/chat/threads/${uid}/messages?populate=sender&limit=1`).catch(() => []);
      const last = [...(msgs || [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        id: `pm-${uid}`,
        kind: "playmetrics",
        source: "PlayMetrics",
        thread: uid,
        name: team.name,
        preview: last ? `${last.sender?.name || ""}: ${last.text || "(attachment)"}` : "",
        at: last?.created_at || "1970-01-01T00:00:00Z",
      };
    })
  );
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const boxes = await pm(session, `/comm/messages/all?start=${start}&end=${end}`).catch(() => []);
  const announcements = (boxes || [])
    .filter((b) => b.name === "Inbox")
    .flatMap((b) => b.messages || [])
    .map((m) => ({
      id: `pm-msg-${m.id}`,
      kind: "playmetrics-message",
      source: "PlayMetrics",
      messageId: m.id,
      title: m.title || "PlayMetrics message",
      author: m.sender?.display_name || m.sender?.name || "",
      text: "",
      at: m.sent_at || m.created_at,
      unread: !m.read_at,
      openUrl: "https://app.playmetrics.com",
    }));
  return [...chats, ...announcements];
}

export async function loadPlaymetricsThread(session, thread) {
  const msgs = (await pm(session, `/chat/threads/${encodeURIComponent(thread)}/messages?populate=sender&limit=40`)) || [];
  const sorted = msgs.filter((m) => !m.deleted_at && !m.removed_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (sorted.length) {
    // Mark the chat read, as the website does when you open it.
    await pm(session, `/chat/threads/${encodeURIComponent(thread)}/messages/${sorted.at(-1).id}/read`, { method: "POST", body: "{}" }).catch(() => {});
  }
  return sorted.map(toMessage);
}

export async function sendPlaymetricsMessage(session, thread, text) {
  const m = await pm(session, `/chat/threads/${encodeURIComponent(thread)}/messages`, {
    method: "POST",
    body: JSON.stringify({ text, type: "text" }),
  });
  return toMessage(m);
}

export async function loadPlaymetricsAnnouncement(session, id) {
  const m = await pm(session, `/comm/messages/${encodeURIComponent(id)}`);
  return {
    title: m.title,
    author: m.sender?.display_name || m.sender?.name || "",
    at: m.sent_at || m.created_at,
    text: String(m.body || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\n{3,}/g, "\n\n").trim(),
    canReply: Boolean(m.can_reply),
  };
}
