// Remind has no public API. This uses the same private endpoints www.remind.com uses, signed in as you
// with your Remind email and password (worked out from captures of the website on 2026-10-08).
// Any update on Remind's side can break it.
const BASE = process.env.REMIND_URL || "https://www.remind.com"; // overridable for local testing
export const REMIND_COOKIE = "sh_remind";

// Remind keeps its sign-in in cookies, plus a CSRF token cookie echoed back in a header.
function storeCookies(session, res) {
  for (const line of res.headers.getSetCookie?.() || []) {
    const [pair, ...attrs] = line.split(";");
    const i = pair.indexOf("=");
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    const expired = attrs.some((a) => /^\s*max-age=0/i.test(a)) || !value;
    if (expired) delete session.jar[name];
    else session.jar[name] = value;
  }
}

// The site reads the CSRF token from its cookie; /v2/csrf_token also returns it in the body.
const csrf = (s) => (s.jar.csrf_token ? decodeURIComponent(s.jar.csrf_token) : s.csrf);

async function remind(session, path, { method = "GET", body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Origin: "https://www.remind.com",
      Referer: "https://www.remind.com/",
      "X-Requested-With": "XMLHttpRequest",
      // Remind's site identifies itself with these; requests without them can be refused.
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
      "remind101-client-name": "Dashboard",
      "remind101-client-segment": "desktop_web",
      "remind101-client-type": "Web",
      "remind101-client-version": "fk-comp-50-samesite-cookies",
      "remind101-timezone-id": "America/New_York",
      "remind101-timezone-offset": String(-new Date().getTimezoneOffset() * 60 || -14400),
      "remind-origin-path": "/log_in",
      "remind-canonical-origin-path": "/log_in",
      "X-Client-Id": session.clientId,
      "X-Session-Id": session.sessionId,
      ...(csrf(session) ? { "X-CSRF-Token": csrf(session) } : {}),
      Cookie: Object.entries(session.jar).map(([k, v]) => `${k}=${v}`).join("; "),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    redirect: "manual",
  });
  storeCookies(session, res);
  if ((res.status === 401 || res.status === 403) && !path.includes("confirmed_login")) throw Object.assign(new Error("Remind sign-in expired"), { status: 401 });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    let why = "";
    try {
      const j = JSON.parse(detail);
      why = j.error?.message || j.message || j.error || (Array.isArray(j.errors) ? j.errors.map((x) => x.message || x).join(", ") : "");
    } catch {}
    throw Object.assign(new Error(`Remind ${res.status}${why ? `: ${String(why).slice(0, 200)}` : ""}`), { status: res.status, why: String(why || "") });
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function gql(session, operationName, query, variables) {
  const json = await remind(session, "/graphql", { method: "POST", body: { operationName, query, variables } });
  if (json?.errors?.length) throw new Error(`Remind: ${json.errors[0].message}`);
  return json.data;
}

// The password is used once here and never saved; only Remind's session cookies are kept.
export async function signInRemind(email, password) {
  const session = { jar: {}, clientId: crypto.randomUUID(), sessionId: crypto.randomUUID() };
  const c = await remind(session, "/v2/csrf_token").catch((e) => {
    throw new Error(`Remind wouldn't start a sign-in (${e.status || e.message})`);
  });
  if (c?.token) session.csrf = c.token;
  let login;
  try {
    login = await remind(session, "/v2/access_tokens/confirmed_login", {
      method: "POST",
      body: { user: { device_address: email, password }, persist: true },
    });
  } catch (e) {
    // Show Remind's own reason so a refused request isn't mistaken for a wrong password.
    if (e.status === 401 && !e.why) throw Object.assign(new Error("Remind didn't accept that email and password"), { status: 401 });
    throw Object.assign(new Error(`Remind refused the sign-in (${e.message})`), { status: 401 });
  }
  // Remind normally sets this cookie itself; keep the returned token as that cookie if it didn't.
  if (login?.token && !session.jar.auth_token) session.jar.auth_token = login.token;
  const user = await remind(session, "/v2/user");
  session.name = user?.display_name || user?.signature || "";
  session.userUuid = user?.uuid;
  return session;
}

// One feed entry per Remind chat (class announcements arrive in these chats too).
export async function loadRemindFeed(session) {
  const { chats = [] } = (await remind(session, "/v2/chats?limit=50&include_messages=false&include_memberships=false")) || {};
  return chats
    .filter((c) => !c.hidden)
    .map((c) => {
      const last = c.last_message;
      const group = c.group_summaries?.[0]?.class_name;
      return {
        id: `remind-${c.uuid}`,
        kind: "remind",
        source: "Remind",
        chatUrl: `/api/remind/chat?chat=${encodeURIComponent(c.uuid)}`,
        name: group && group !== c.proper_title ? `${c.proper_title || c.title} · ${group}` : c.proper_title || c.title || group || "Remind chat",
        preview: last ? `${last.sender?.name || ""}: ${last.body || "(attachment)"}` : "",
        at: last?.created_at || c.updated_at || "1970-01-01T00:00:00Z",
        unread: c.unread_messages > 0,
      };
    });
}

const THREAD_QUERY = `query GetChatStreamItems($uuid: String!, $gapItemNextPageParams: String) {
  chatStreams(chatUuids: [$uuid]) {
    uuid
    sequenceItems(gapItemNextPageParams: $gapItemNextPageParams) {
      seq
      item {
        uuid
        __typename
        ... on MessageItem { body createdAt sentAt files { url contentType } sender: sender2 { name } }
        ... on SystemMessageItem { body }
      }
    }
  }
}`;

export async function loadRemindThread(session, chat) {
  const data = await gql(session, "GetChatStreamItems", THREAD_QUERY, { uuid: chat, gapItemNextPageParams: JSON.stringify({ limit: 40, since_seq: 0 }) });
  const items = (data?.chatStreams?.[0]?.sequenceItems || []).filter((s) => s.item?.__typename === "MessageItem");
  const lastSeq = Math.max(0, ...items.map((s) => Number(s.seq) || 0));
  if (lastSeq) {
    // Mark the chat read, as the website does when you open it.
    await remind(session, `/v2/chats/${encodeURIComponent(chat)}`, {
      method: "POST",
      headers: { "X-HTTP-Method-Override": "PATCH" },
      body: { chat: { last_read_seq: lastSeq } },
    }).catch(() => {});
  }
  return items
    .sort((a, b) => Number(a.seq) - Number(b.seq))
    .map(({ item }) => ({
      id: item.uuid,
      author: item.sender?.name || "",
      text: item.body || "",
      images: (item.files || []).filter((f) => /^image\//.test(f.contentType || "")).map((f) => f.url),
      at: item.sentAt || item.createdAt,
      likes: 0,
    }));
}

const SEND_QUERY = `mutation putMessage($input: PutMessageInput!) {
  putMessage(input: $input) {
    messages { chatMessages { item { ... on MessageItem { uuid } } } }
    error { code message }
  }
}`;

export async function sendRemindMessage(session, chat, text) {
  const data = await gql(session, "putMessage", SEND_QUERY, {
    input: {
      recipients: [{ uuid: chat, type: "chat", filters: [] }],
      message: { body: text, fileUuids: [], linkPreviews: [], translations: {}, personalizedVoiceMessage: false, personalizedVoiceMessageFileUuid: null },
      uuid: crypto.randomUUID(),
    },
  });
  const err = data?.putMessage?.error;
  if (err) throw new Error(err.message || "Remind didn't send that message");
  return { ok: true };
}
