// PlayMetrics has no public API. This uses the same private endpoints app.playmetrics.com uses,
// signed in as you (worked out from captures of the website on 2026-10-05). Any update can break it.
const API = process.env.PLAYMETRICS_API_URL || "https://api.playmetrics.com"; // overridable for local testing
export const PM_COOKIE = "sh_playmetrics";

// PlayMetrics signs in through Google Firebase with email + password. This is the website's own public
// Firebase web key (it ships in app.playmetrics.com's config script), not a secret.
const FIREBASE_KEY = process.env.PLAYMETRICS_FIREBASE_KEY || "AIzaSyBzoJzZJ8flf7colzI0FjruUwJV_tqRj4M";
const IDENTITY = process.env.PLAYMETRICS_IDENTITY_URL || "https://identitytoolkit.googleapis.com/v1";
const SECURETOKEN = process.env.PLAYMETRICS_SECURETOKEN_URL || "https://securetoken.googleapis.com/v1";

async function google(url, body, form) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": form ? "application/x-www-form-urlencoded" : "application/json", Origin: "https://app.playmetrics.com" },
    body: form ? new URLSearchParams(body).toString() : JSON.stringify(body),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = json.error?.message || `error ${res.status}`;
    const wrong = /INVALID_LOGIN_CREDENTIALS|INVALID_PASSWORD|EMAIL_NOT_FOUND|INVALID_EMAIL/.test(code);
    throw Object.assign(new Error(wrong ? "PlayMetrics didn't accept that email and password" : `PlayMetrics sign-in failed (${code})`), {
      status: wrong || /TOKEN_EXPIRED|INVALID_REFRESH_TOKEN|USER_DISABLED/.test(code) ? 401 : 502,
    });
  }
  return json;
}

// The password is used once here and never saved; only Firebase's refresh token is kept.
export async function signInPlaymetrics(email, password) {
  const r = await google(`${IDENTITY}/accounts:signInWithPassword?key=${FIREBASE_KEY}`, { email, password, returnSecureToken: true });
  const session = { idToken: r.idToken, refreshToken: r.refreshToken, expiresAt: Date.now() + Number(r.expiresIn || 3600) * 1000 };
  const user = await pm(session, "/firebase/user/login", { method: "POST", body: JSON.stringify({ client_type: "desktop" }) });
  if (!user?.access_key) throw new Error("PlayMetrics signed in but didn't return a session");
  return { ...session, accessKey: user.access_key, roles: rolesOf(user), name: [user.first_name, user.last_name].filter(Boolean).join(" ") };
}

const rolesOf = (user) => (user.roles || []).map((r) => ({ id: r.id, clubId: r.club_id, club: r.club_name || r.name }));

// PlayMetrics shows one club at a time (a "role": parent at UFA, parent at Falcons, ...). The website
// switches clubs by signing in again with that role; teams, chats and messages then belong to it.
async function useRole(session, roleId) {
  const user = await pm(session, "/firebase/user/login", { method: "POST", body: JSON.stringify({ current_role_id: roleId, client_type: "desktop" }) });
  if (user?.access_key) session.accessKey = user.access_key;
  if (user?.roles) session.roles = rolesOf(user);
  return (user?.teams || []).filter((t) => !t.archived);
}

// Runs fn once per club, one club at a time (switching is server-side, so these can't overlap).
async function eachClub(session, fn) {
  if (!session.roles?.length) await useRole(session, "");
  const out = [];
  for (const role of session.roles || []) out.push(await fn(role, await useRole(session, role.id)).catch(() => []));
  return out.flat();
}

async function forThread(session, thread) {
  const clubId = Number(String(thread).split("_")[1]);
  if (!session.roles?.length) await useRole(session, "");
  const role = (session.roles || []).find((r) => r.clubId === clubId);
  if (role) await useRole(session, role.id);
}

// Firebase sign-ins last an hour; swap the refresh token for a fresh one when it's close to running out.
export async function ensurePlaymetrics(session) {
  if (session.expiresAt - Date.now() > 120000) return session;
  const r = await google(`${SECURETOKEN}/token?key=${FIREBASE_KEY}`, { grant_type: "refresh_token", refresh_token: session.refreshToken }, true);
  return { ...session, idToken: r.id_token, refreshToken: r.refresh_token || session.refreshToken, expiresAt: Date.now() + Number(r.expires_in || 3600) * 1000 };
}

// Each team's PlayMetrics calendar link, for the Schedule tab.
export async function playmetricsCalendars(session) {
  return eachClub(session, async (role, teams) =>
    teams.filter((t) => t.calendar_url).map((t) => ({ url: t.calendar_url, name: `PlayMetrics · ${t.name}` }))
  );
}

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
  const items = await eachClub(session, (role, teams) => clubFeed(session, role, teams));
  return items.filter((item, i) => items.findIndex((x) => x.id === item.id) === i);
}

async function clubFeed(session, role, teams) {
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
        chatUrl: `/api/playmetrics/chat?thread=${encodeURIComponent(uid)}`,
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
      source: `PlayMetrics · ${role.club}`,
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
  await forThread(session, thread);
  const msgs = (await pm(session, `/chat/threads/${encodeURIComponent(thread)}/messages?populate=sender&limit=40`)) || [];
  const sorted = msgs.filter((m) => !m.deleted_at && !m.removed_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (sorted.length) {
    // Mark the chat read, as the website does when you open it.
    await pm(session, `/chat/threads/${encodeURIComponent(thread)}/messages/${sorted.at(-1).id}/read`, { method: "POST", body: "{}" }).catch(() => {});
  }
  return sorted.map(toMessage);
}

export async function sendPlaymetricsMessage(session, thread, text) {
  await forThread(session, thread);
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
