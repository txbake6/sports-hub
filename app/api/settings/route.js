import { NextResponse } from "next/server";
import { checkToken } from "../../../lib/groupme";
import { readSettings, writeSettings } from "../../../lib/settings";
import { HEJA_COOKIE } from "../../../lib/heja";
import { TS_COOKIE, teamsnapConfigured } from "../../../lib/teamsnap";

export const dynamic = "force-dynamic";

function summary(req, s) {
  return {
    feeds: s.feeds,
    groupme: Boolean(process.env.GROUPME_TOKEN || s.groupmeToken),
    heja: Boolean(req.cookies.get(HEJA_COOKIE)),
    teamsnap: { available: teamsnapConfigured(), connected: Boolean(req.cookies.get(TS_COOKIE)) },
  };
}

export async function GET(req) {
  return NextResponse.json(summary(req, readSettings(req)));
}

// Body: { addFeed: {url, name?} } | { removeFeed: url } | { groupmeToken: string|null }
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const s = readSettings(req);
  try {
    if (body.addFeed) {
      const url = String(body.addFeed.url || "").trim().replace(/^webcal:\/\//i, "https://");
      if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("That doesn't look like a calendar link");
      if (s.feeds.length >= 20) throw new Error("That's the most calendars this app can hold");
      const name = String(body.addFeed.name || "").trim().slice(0, 60);
      if (!s.feeds.some((f) => f.url === url)) s.feeds.push(name ? { url, name } : { url });
    }
    if (body.removeFeed) s.feeds = s.feeds.filter((f) => f.url !== body.removeFeed);
    if ("groupmeToken" in body) {
      const token = body.groupmeToken ? String(body.groupmeToken).trim() : null;
      if (token) {
        const ok = await checkToken(token).then(() => true, () => false);
        if (!ok) throw new Error("GroupMe didn't accept that key. Copy it again from dev.groupme.com");
      }
      s.groupmeToken = token;
    }
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  const res = NextResponse.json(summary(req, s));
  writeSettings(res, s);
  return res;
}
