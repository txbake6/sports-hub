import crypto from "node:crypto";

// TeamSnap's official API (APIv3, Collection+JSON). Register an app at https://auth.teamsnap.com
// to get TEAMSNAP_CLIENT_ID / TEAMSNAP_CLIENT_SECRET, with redirect URI <your app>/api/teamsnap/callback.
const AUTH = "https://auth.teamsnap.com";
const API = "https://apiv3.teamsnap.com/v3";
export const TS_COOKIE = "sh_teamsnap";

export function teamsnapConfigured() {
  return Boolean(process.env.TEAMSNAP_CLIENT_ID && process.env.TEAMSNAP_CLIENT_SECRET);
}

export function redirectUri(req) {
  return new URL("/api/teamsnap/callback", req.url).toString();
}

export function authorizeUrl(req, state) {
  const q = new URLSearchParams({
    client_id: process.env.TEAMSNAP_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "read",
    state,
  });
  return `${AUTH}/oauth/authorize?${q}`;
}

export async function exchangeCode(req, code) {
  const res = await fetch(`${AUTH}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.TEAMSNAP_CLIENT_ID,
      client_secret: process.env.TEAMSNAP_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
    }),
  });
  if (!res.ok) throw new Error(`TeamSnap sign-in failed (${res.status})`);
  return (await res.json()).access_token;
}

// The access token is kept in an encrypted, httpOnly cookie, so no database is needed.
function key() {
  return crypto.createHash("sha256").update(`${process.env.APP_PASSWORD}|${process.env.TEAMSNAP_CLIENT_SECRET}`).digest();
}

export function sealToken(token) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function openToken(sealed) {
  try {
    const buf = Buffer.from(sealed, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// Collection+JSON items carry their fields as [{name, value}]; flatten them.
const flatten = (item) => Object.fromEntries((item.data || []).map((f) => [f.name, f.value]));

async function ts(token, path) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.collection+json" },
    cache: "no-store",
  });
  if (res.status === 401) throw Object.assign(new Error("TeamSnap sign-in expired"), { status: 401 });
  if (!res.ok) throw new Error(`TeamSnap ${res.status}`);
  return ((await res.json()).collection?.items || []).map(flatten);
}

export async function loadTeamsnapMessages(token) {
  const [me] = await ts(token, "/me");
  if (!me?.id) return [];
  const [messages, teams] = await Promise.all([
    ts(token, `/messages/search?user_id=${me.id}`),
    ts(token, `/teams/search?user_id=${me.id}`).catch(() => []),
  ]);
  const teamName = Object.fromEntries(teams.map((t) => [t.id, t.name]));
  return messages
    .map((m) => ({
      id: `teamsnap-${m.id}`,
      kind: "teamsnap",
      source: "TeamSnap",
      title: m.subject || teamName[m.team_id] || "TeamSnap message",
      author: m.sender_name || teamName[m.team_id] || "",
      text: String(m.body || m.message || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 600),
      at: m.created_at || m.updated_at || new Date().toISOString(),
      unread: m.is_read === false,
      openUrl: m.team_id ? `https://go.teamsnap.com/${m.team_id}/messages` : "https://go.teamsnap.com",
    }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 40);
}
