// TeamSnap ONE has no public API. This uses the same private endpoints identity.teamsnap.com uses,
// signed in as you with your TeamSnap email and password (worked out from a capture of the website
// on 2026-10-08). Team chat runs on Stream (getstream.io) with a chat token TeamSnap hands out.
// Any update on TeamSnap's side can break it.
const AUTH = process.env.TS1_AUTH_URL || "https://authentication-api.teamsnap.com";
const TEAMS = process.env.TS1_TEAM_URL || "https://fusion-team-api.teamsnap.com";
const STREAM = process.env.TS1_STREAM_URL || "https://chat.stream-io-api.com";
// TeamSnap's public Stream app key, shipped in its website; not a secret.
const STREAM_KEY = process.env.TS1_STREAM_KEY || "wkr2r6wgukbb";
const ORIGIN = "https://identity.teamsnap.com";
const TZ = "America/New_York";
export const TS1_COOKIE = "sh_teamsnapone";

function storeCookies(session, res) {
  for (const line of res.headers.getSetCookie?.() || []) {
    const [pair, ...attrs] = line.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (!value || attrs.some((a) => /^\s*max-age=0/i.test(a))) delete session.jar[name];
    else session.jar[name] = value;
  }
}

async function ts(session, url, { method = "GET", body } = {}) {
  const cookie = Object.entries(session.jar || {}).map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      Origin: ORIGIN,
      Referer: `${ORIGIN}/`,
      "x-ts-locale": "en-US",
      "x-ts-platform": "web",
      "x-ts-timezone": TZ,
      ...(cookie ? { Cookie: cookie } : {}),
      // The website relies on its sign-in cookie; fall back to the sign-in token if no cookie was set.
      ...(!cookie && session.token ? { Authorization: `Bearer ${session.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  storeCookies(session, res);
  if (res.status === 401) throw Object.assign(new Error("TeamSnap ONE sign-in expired"), { status: 401 });
  if (!res.ok) throw Object.assign(new Error(`TeamSnap ONE ${res.status}`), { status: res.status });
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// The password is used once here and never saved; only TeamSnap's session is kept.
export async function signInTeamsnapOne(email, password) {
  const session = { jar: {} };
  let r;
  try {
    r = await ts(session, `${AUTH}/v1/signin`, { method: "POST", body: { username: email, password, upgrade: false, ts1Eligible: false } });
  } catch (e) {
    if (e.status === 401 || e.status === 422) throw Object.assign(new Error("TeamSnap didn't accept that email and password"), { status: 401 });
    throw e;
  }
  session.token = r?.token;
  session.name = [r?.user?.firstName, r?.user?.lastName].filter(Boolean).join(" ");
  await teamCards(session); // proves the session works before we save it
  return session;
}

async function teamCards(session) {
  const { teams = {} } = (await ts(session, `${TEAMS}/v1/team-cards`)) || {};
  return Object.values(teams).map((t) => ({ id: t.teamId || t.id, name: t.displayTitle, subtitle: t.displaySubtitle }));
}

// Stream chat needs its own short-lived token; fetch a fresh one each time it's used.
async function stream(session, path, body) {
  const { chatUserId, token } = await ts(session, `${TEAMS}/v1/chat/token`, { method: "POST", body: {} });
  const res = await fetch(`${STREAM}${path}${path.includes("?") ? "&" : "?"}user_id=${encodeURIComponent(chatUserId)}&api_key=${STREAM_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "stream-auth-type": "jwt", Origin: ORIGIN, Referer: `${ORIGIN}/` },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TeamSnap ONE chat ${res.status}`);
  return { ...(await res.json()), chatUserId };
}

const toMessage = (m) => ({
  id: m.id,
  author: m.user?.name || "",
  text: m.text || "",
  images: (m.attachments || []).filter((a) => a.type === "image" && a.image_url).map((a) => a.image_url),
  at: m.created_at,
  likes: Object.values(m.reaction_counts || {}).reduce((n, c) => n + c, 0),
});

const chatUrl = (cid) => `/api/teamsnapone/chat?cid=${encodeURIComponent(cid)}`;

// One feed entry per team chat.
export async function loadTeamsnapOneFeed(session) {
  const { token, chatUserId } = await ts(session, `${TEAMS}/v1/chat/token`, { method: "POST", body: {} });
  const res = await fetch(`${STREAM}/channels?user_id=${encodeURIComponent(chatUserId)}&api_key=${STREAM_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: token, "stream-auth-type": "jwt", Origin: ORIGIN, Referer: `${ORIGIN}/` },
    body: JSON.stringify({
      filter_conditions: { type: { $in: ["team_chat", "messaging"] }, members: { $in: [chatUserId] } },
      sort: [{ field: "last_message_at", direction: -1 }],
      state: true,
      watch: false,
      presence: false,
      limit: 30,
      message_limit: 1,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TeamSnap ONE chat ${res.status}`);
  const { channels = [] } = await res.json();
  return channels.map(({ channel, messages = [], read = [] }) => {
    const last = messages.at(-1);
    const mine = read.find((r) => r.user?.id === chatUserId);
    return {
      id: `ts1-${channel.cid}`,
      kind: "teamsnapone",
      source: "TeamSnap ONE",
      chatUrl: chatUrl(channel.cid),
      name: channel.name || "TeamSnap ONE chat",
      preview: last ? `${last.user?.name || ""}: ${last.text || (last.attachments?.length ? "(photo)" : "")}` : "",
      at: last?.created_at || channel.last_message_at || channel.created_at,
      unread: Boolean(mine?.unread_messages),
    };
  });
}

const channelPath = (cid) => {
  const [type, id] = String(cid).split(":");
  if (!type || !id) throw new Error("Unknown chat");
  return `/channels/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
};

export async function loadTeamsnapOneThread(session, cid) {
  const { messages = [] } = await stream(session, `${channelPath(cid)}/query`, { state: true, watch: false, presence: false, messages: { limit: 40 } });
  await stream(session, `${channelPath(cid)}/read`, {}).catch(() => {}); // mark read, as the website does
  return messages.filter((m) => m.type !== "deleted").map(toMessage);
}

export async function sendTeamsnapOneMessage(session, cid, text) {
  const { message } = await stream(session, `${channelPath(cid)}/message`, { message: { id: crypto.randomUUID(), type: "regular", text } });
  return toMessage(message);
}

// "2026-11-01" + "19:00" in America/New_York -> UTC ISO string.
function zonedISO(date, time, timeZone) {
  const guess = new Date(`${date}T${time || "00:00"}:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
      .formatToParts(guess).map((p) => [p.type, p.value])
  );
  const asZone = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return new Date(guess.getTime() - (asZone - guess.getTime())).toISOString();
}

// Each team's events, for the Schedule tab.
export async function loadTeamsnapOneEvents(session) {
  const teams = await teamCards(session);
  const lists = await Promise.all(
    teams.map(async (team) => {
      const r = await ts(session, `${TEAMS}/web/v1/teams/${encodeURIComponent(team.id)}/events`).catch(() => null);
      const groups = [...(r?.upcomingEvents || []), ...(r?.pastEvents || [])];
      return groups.flatMap((g) => g.events || []).map((ev) => {
        const t = ev.time || {};
        const allDay = !t.startTime;
        const start = allDay ? `${t.startDate}T00:00:00.000Z` : zonedISO(t.startDate, t.startTime, t.timeZone || TZ);
        const end = allDay ? start : new Date(new Date(start).getTime() + (t.durationMinutes || 60) * 60000).toISOString();
        return {
          id: `ts1|${ev.id}`,
          source: `TeamSnap ONE · ${team.name}`,
          title: ev.name?.title || ev.type || "Event",
          location: [ev.location?.name, ev.location?.subtitle].filter(Boolean).join(", "),
          notes: "",
          start,
          end,
          allDay,
          cancelled: /cancel/i.test(ev.status || ""),
        };
      });
    })
  );
  return { teams, events: lists.flat() };
}
