import { NextResponse } from "next/server";
import { checkToken } from "../../../lib/groupme";
import { readSettings, readUploads, writeSettings } from "../../../lib/settings";
import { HEJA_COOKIE } from "../../../lib/heja";
import { PM_COOKIE } from "../../../lib/playmetrics";
import { REMIND_COOKIE } from "../../../lib/remind";
import { TS1_COOKIE } from "../../../lib/teamsnapone";
import { TS_COOKIE, teamsnapConfigured } from "../../../lib/teamsnap";
import { sharedStorage, vaultGet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

async function summary(req, s) {
  return {
    synced: sharedStorage(),
    feeds: s.feeds,
    uploads: (await readUploads(req)).map((u) => ({ id: u.id, name: u.name, at: u.at })),
    styles: s.styles,
    groupme: Boolean(process.env.GROUPME_TOKEN || s.groupmeToken),
    heja: Boolean(await vaultGet(req, HEJA_COOKIE)),
    playmetrics: Boolean(await vaultGet(req, PM_COOKIE)),
    remind: Boolean(await vaultGet(req, REMIND_COOKIE)),
    teamsnapone: Boolean(await vaultGet(req, TS1_COOKIE)),
    teamsnap: { available: teamsnapConfigured(), connected: Boolean(await vaultGet(req, TS_COOKIE)) },
  };
}

export async function GET(req) {
  return NextResponse.json(await summary(req, await readSettings(req)));
}

// Body: { addFeed: {url, name?} } | { removeFeed: url } | { groupmeToken: string|null }
//     | { setStyle: {source, color?, icon?} } | { resetStyle: source }
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const s = await readSettings(req);
  try {
    if (body.addFeed) {
      const url = String(body.addFeed.url || "").trim().replace(/^webcal:\/\//i, "https://");
      if (!/^https?:\/\/\S+$/i.test(url)) throw new Error("That doesn't look like a calendar link");
      if (s.feeds.length >= 20) throw new Error("That's the most calendars this app can hold");
      const name = String(body.addFeed.name || "").trim().slice(0, 60);
      if (!s.feeds.some((f) => f.url === url)) s.feeds.push(name ? { url, name } : { url });
    }
    if (body.setStyle?.source) {
      const { source, color, icon } = body.setStyle;
      const cur = s.styles[source] || {};
      if (color !== undefined) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error("Pick a color");
        cur.color = color;
      }
      if (icon !== undefined) cur.icon = String(icon).slice(0, 8);
      s.styles = { ...s.styles, [String(source).slice(0, 120)]: cur };
    }
    if (body.resetStyle) {
      const { [body.resetStyle]: _gone, ...rest } = s.styles;
      s.styles = rest;
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
  const res = NextResponse.json(await summary(req, s));
  await writeSettings(res, s);
  return res;
}
