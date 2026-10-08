import { NextResponse } from "next/server";
import { loadSchedule } from "../../../lib/schedule";
import { readSettings } from "../../../lib/settings";
import { HEJA_COOKIE, ensureToken, loadHejaActivities } from "../../../lib/heja";
import { cookieOpts, seal, unseal } from "../../../lib/seal";

export const dynamic = "force-dynamic";

// Calendar links (built-in and ones added in Setup) plus Heja's schedule straight from Heja.
export async function GET(req) {
  const { feeds } = readSettings(req);
  const hejaSaved = unseal(req.cookies.get(HEJA_COOKIE)?.value);
  let hejaSession = null;
  const [schedule, heja] = await Promise.all([
    loadSchedule({ extraFeeds: feeds.map((f) => ({ ...f })) }),
    hejaSaved
      ? ensureToken(hejaSaved)
          .then((s) => {
            hejaSession = s;
            return loadHejaActivities(s);
          })
          .then((events) => ({ events }))
          .catch((e) => ({ events: [], error: e.message }))
      : null,
  ]);
  if (heja) {
    schedule.events.push(...heja.events);
    schedule.events.sort((a, b) => a.start.localeCompare(b.start));
    const names = [...new Set(heja.events.map((e) => e.source))];
    schedule.sources.push(...(names.length ? names : ["Heja"]));
    if (heja.error) schedule.errors.push({ source: "Heja", error: heja.error });
  }
  const res = NextResponse.json(schedule);
  if (hejaSession) res.cookies.set(HEJA_COOKIE, seal(hejaSession), cookieOpts(60 * 60 * 24 * 365));
  return res;
}
