import crypto from "node:crypto";

// Heja has no public API. This talks to the same private endpoints web.heja.io uses, signed in as
// you (worked out from a capture of the website on 2026-10-05). Any Heja update can break it.
const AUTH = process.env.HEJA_AUTH_URL || "https://auth.heja.io"; // overridable for local testing
const GRAPHQL = process.env.HEJA_GRAPHQL_URL || "https://web-api.heja.io/graphql";
// web.heja.io hashes the emailed 4-digit code with this value before sending it (it ships in their web app).
const CODE_SALT = "atropine-radices-necrotic-coaxial";
export const HEJA_COOKIE = "sh_heja";
export const HEJA_REF_COOKIE = "sh_heja_ref";

const DEVICE = crypto.createHash("sha256").update("sports-hub").digest("hex");
const HEADERS = {
  Accept: "application/json",
  "Content-Type": "application/json",
  "heja-api-version": "3",
  "x-app-version-brand": "web",
  Origin: "https://web.heja.io",
};

async function auth(path, body, cookie) {
  const res = await fetch(`${AUTH}${path}`, {
    method: "POST",
    headers: { ...HEADERS, ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify({ deviceToken: DEVICE, ...body }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(res.status === 404 ? "That email isn't registered with Heja" : `Heja sign-in failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  const cookies = (res.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ");
  return { data: json.data || json, cookies };
}

// Step 1: Heja emails a 4-digit code. Returns the reference to pair with it.
export async function requestCode(email) {
  const { data } = await auth("/verificationcode", { email, checkExisting: true });
  return data.ref;
}

// Step 2: trade the code for a long-lived session. We keep whatever Heja hands back
// (a refresh token in the body, a cookie, or both) and use it to mint short-lived auth tokens.
export async function verifyCode(ref, code) {
  const hashed = crypto.createHash("sha256").update(`${code}${CODE_SALT}`).digest("hex");
  const { data, cookies } = await auth("/login/email", {
    credentialType: "email",
    code: hashed,
    createNew: false,
    verificationRef: ref,
    setCookie: false,
  });
  return { refreshToken: data.refreshToken || null, cookie: cookies || null, authToken: data.authToken || null, validTo: Number(data.authTokenValidTo) || 0 };
}

// Returns a fresh session object (possibly rotated) with a usable authToken.
export async function ensureToken(session) {
  if (session.authToken && Date.now() < session.validTo - 30000) return session;
  const { data, cookies } = await auth(
    "/login/refreshToken",
    { credentialType: "refreshToken", refreshToken: session.refreshToken || "cookie" },
    session.cookie
  );
  return {
    refreshToken: data.refreshToken || session.refreshToken,
    cookie: cookies || session.cookie,
    authToken: data.authToken,
    validTo: Number(data.authTokenValidTo) || Date.now() + 10 * 60000,
  };
}

async function gql(session, operationName, query, variables = {}) {
  const res = await fetch(GRAPHQL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "*/*", Origin: "https://web.heja.io", Authorization: `Bearer ${session.authToken}` },
    body: JSON.stringify({ operationName, query, variables }),
    cache: "no-store",
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    throw new Error(`Heja ${res.status}${json.errors?.[0]?.message ? `: ${json.errors[0].message}` : ""}`);
  }
  return json.data;
}

const TEAMS = `query GetMeTeams { me { _id teams { _id name hasAccess color } } }`;
const POSTS = `query GetPosts($teamid: String!, $cursor: String) {
  posts(input: {teamid: $teamid, cursor: $cursor}) {
    edges { node { _id text touchdate createdAt creator { _id fullName profileImage }
      images { ... on ImageAttachment { _id url } }
      comments(filter: {last: 1}) { _id text publishdate creator { _id fullName } } } }
  }
}`;
const POST = `query GetPost($teamid: String!, $postid: String!) {
  post(input: {teamid: $teamid, postid: $postid}) {
    _id text createdAt creator { _id fullName profileImage }
    images { ... on ImageAttachment { _id url } }
    comments { _id text publishdate creator { _id fullName profileImage } }
  }
}`;
const COMMENT = `mutation CreatePostComment($teamid: String!, $postid: String!, $commentText: String!) {
  createComment(input: {teamid: $teamid, postid: $postid, comment: $commentText}) { node { _id } }
}`;

const imageUrl = (u) => (u && !u.startsWith("http") ? `https://images.heja.io/${u}?width=128` : u);

export async function loadHejaPosts(session) {
  const { me } = await gql(session, "GetMeTeams", TEAMS);
  const teams = (me?.teams || []).filter((t) => t.hasAccess !== false);
  const perTeam = await Promise.all(
    teams.map(async (team) => {
      const { posts } = await gql(session, "GetPosts", POSTS, { teamid: team._id });
      return (posts?.edges || []).map(({ node: p }) => {
        const last = p.comments?.[0];
        return {
          id: `heja-${p._id}`,
          kind: "heja",
          source: "Heja",
          teamid: team._id,
          postid: p._id,
          title: team.name,
          author: p.creator?.fullName || "",
          text: (p.text || "").trim(),
          lastComment: last ? `${last.creator?.fullName}: ${last.text}` : "",
          at: (last?.publishdate && last.publishdate > (p.touchdate || "") ? last.publishdate : p.touchdate || p.createdAt),
          openUrl: "https://web.heja.io/posts",
        };
      });
    })
  );
  return perTeam.flat();
}

export async function loadHejaPost(session, teamid, postid) {
  const { post } = await gql(session, "GetPost", POST, { teamid, postid });
  return {
    text: post.text,
    author: post.creator?.fullName,
    at: post.createdAt,
    images: (post.images || []).map((i) => i.url).filter(Boolean),
    comments: (post.comments || []).map((c) => ({
      id: c._id,
      author: c.creator?.fullName,
      avatar: imageUrl(c.creator?.profileImage),
      text: c.text,
      at: c.publishdate,
    })),
  };
}

export async function commentOnHejaPost(session, teamid, postid, text) {
  await gql(session, "CreatePostComment", COMMENT, { teamid, postid, commentText: text });
}

const ACTIVITIES = `query UpcomingActivitiesList($teamid: String!, $cursor: String, $past: Boolean) {
  activities(input: {teamid: $teamid, cursor: $cursor, past: $past}) {
    pageInfo { endCursor hasNextPage }
    edges { node { _id title startdate meetdate cancelled tag { name } opponent { name } location { name address } } }
  }
}`;

// Upcoming games and practices for every Heja team, in the same shape as calendar events.
export async function loadHejaActivities(session, { pages = 3 } = {}) {
  const { me } = await gql(session, "GetMeTeams", TEAMS);
  const teams = (me?.teams || []).filter((t) => t.hasAccess !== false);
  const perTeam = await Promise.all(
    teams.map(async (team) => {
      const out = [];
      let cursor = null;
      for (let i = 0; i < pages; i++) {
        const { activities } = await gql(session, "UpcomingActivitiesList", ACTIVITIES, { teamid: team._id, cursor, past: false });
        for (const { node: a } of activities?.edges || []) {
          const start = new Date(a.startdate);
          const tag = a.tag?.name;
          const title = a.opponent?.name ? `${tag || "Game"} vs ${a.opponent.name}` : a.title || tag || "Activity";
          out.push({
            id: `heja|${a._id}`,
            source: `Heja · ${team.name}`,
            title: a.cancelled ? `Cancelled: ${title}` : title,
            location: [a.location?.name, a.location?.address].filter(Boolean).join(", "),
            notes: a.meetdate ? `Meet at ${new Date(a.meetdate).toISOString()}` : "",
            start: start.toISOString(),
            end: new Date(start.getTime() + 60 * 60000).toISOString(),
            allDay: false,
            cancelled: Boolean(a.cancelled),
          });
        }
        if (!activities?.pageInfo?.hasNextPage) break;
        cursor = activities.pageInfo.endCursor;
      }
      return out;
    })
  );
  return perTeam.flat();
}
