import ical from "node-ical";

// CALENDAR_FEEDS is a JSON array: [{"name": "Heja - U10 Tigers", "url": "webcal://..."}]
export function feedList() {
  try {
    const feeds = JSON.parse(process.env.CALENDAR_FEEDS || "[]");
    return feeds.filter((f) => f && f.url);
  } catch {
    return [];
  }
}

function toEvent(feed, ev, start, end) {
  return {
    id: `${feed.name}|${ev.uid}|${start.toISOString()}`,
    source: feed.name,
    title: ev.summary || "(no title)",
    location: ev.location || "",
    notes: ev.description || "",
    start: start.toISOString(),
    end: (end || start).toISOString(),
    allDay: ev.datetype === "date",
  };
}

// Expand one VEVENT into concrete occurrences inside [from, to].
function occurrences(feed, ev, from, to) {
  const duration = ev.end ? ev.end - ev.start : 0;
  if (!ev.rrule) {
    return ev.start <= to && (ev.end || ev.start) >= from ? [toEvent(feed, ev, ev.start, ev.end)] : [];
  }
  const out = [];
  for (const date of ev.rrule.between(from, to, true)) {
    const key = date.toISOString().slice(0, 10);
    if (ev.exdate && Object.keys(ev.exdate).some((k) => k.startsWith(key))) continue;
    const override = ev.recurrences?.[key];
    if (override) out.push(toEvent(feed, override, override.start, override.end));
    else out.push(toEvent(feed, ev, date, new Date(date.getTime() + duration)));
  }
  return out;
}

export async function loadSchedule({ daysBack = 7, daysAhead = 90 } = {}) {
  const from = new Date(Date.now() - daysBack * 864e5);
  const to = new Date(Date.now() + daysAhead * 864e5);
  const feeds = feedList();
  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const url = feed.url.replace(/^webcal:\/\//i, "https://");
      const data = await ical.async.fromURL(url);
      return Object.values(data)
        .filter((item) => item.type === "VEVENT" && item.start)
        .flatMap((ev) => occurrences(feed, ev, from, to));
    })
  );
  const events = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") events.push(...r.value);
    else errors.push({ source: feeds[i].name, error: String(r.reason?.message || r.reason) });
  });
  events.sort((a, b) => a.start.localeCompare(b.start));
  return { events, errors, sources: feeds.map((f) => f.name) };
}
