import { NextResponse } from "next/server";
import { loadSchedule } from "../../../lib/schedule";
import { readSettings } from "../../../lib/settings";
import { HEJA_COOKIE, ensureToken, loadHejaActivities } from "../../../lib/heja";
import { PM_COOKIE, ensurePlaymetrics, playmetricsCalendars } from "../../../lib/playmetrics";
import { vaultGet, vaultSet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

// Calendar links (built-in and ones added in Setup) plus Heja's schedule straight from Heja.
export async function GET(req) {
  const { feeds } = await readSettings(req);
  const hejaSaved = await vaultGet(req, HEJA_COOKIE);
  const pmSaved = await vaultGet(req, PM_COOKIE);
  let hejaSession = null;
  let pmSession = null;
  let pmError = null;
  // PlayMetrics publishes a calendar link per team; add them alongside the ones from Setup.
  const pmFeeds = pmSaved
    ? await ensurePlaymetrics(pmSaved)
        .then((s) => { pmSession = s; return playmetricsCalendars(s); })
        .catch((e) => { pmError = e.message; return []; })
    : [];
  const known = new Set(feeds.map((f) => f.url));
  const [schedule, heja] = await Promise.all([
    loadSchedule({ extraFeeds: [...feeds.map((f) => ({ ...f })), ...pmFeeds.filter((f) => !known.has(f.url))] }),
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
  if (pmError) schedule.errors.push({ source: "PlayMetrics", error: pmError });
  const res = NextResponse.json(schedule);
  if (hejaSession) await vaultSet(res, HEJA_COOKIE, hejaSession);
  if (pmSession && pmSession !== pmSaved) await vaultSet(res, PM_COOKIE, pmSession);
  return res;
}
