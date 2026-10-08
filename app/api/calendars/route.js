import { NextResponse } from "next/server";
import ical from "node-ical";
import { readUploads, writeUploads } from "../../../lib/settings";
import { sharedStorage } from "../../../lib/vault";

export const dynamic = "force-dynamic";

const MAX = 700_000; // keep all uploads together well under the database's 1 MB value limit

// Body: { name, ics } — the text of an .ics file picked in Setup.
export async function POST(req) {
  if (!sharedStorage()) return NextResponse.json({ error: "Uploading needs the shared database (Vercel Storage)" }, { status: 400 });
  const { name, ics } = await req.json().catch(() => ({}));
  const text = String(ics || "");
  if (!/BEGIN:VCALENDAR/i.test(text)) return NextResponse.json({ error: "That file isn't a calendar (.ics) file" }, { status: 400 });
  let events = 0;
  let calName = "";
  try {
    const data = ical.sync.parseICS(text);
    events = Object.values(data).filter((x) => x.type === "VEVENT").length;
    calName = Object.values(data).find((x) => x.type === "VCALENDAR")?.["WR-CALNAME"] || "";
  } catch {
    return NextResponse.json({ error: "Couldn't read that calendar file" }, { status: 400 });
  }
  if (!events) return NextResponse.json({ error: "That calendar file has no events in it" }, { status: 400 });
  const list = await readUploads(req);
  const label = String(name || calName || "Uploaded calendar").replace(/\.ics$/i, "").trim().slice(0, 60);
  const next = [...list.filter((u) => u.name !== label), { id: crypto.randomUUID(), name: label, ics: text, at: new Date().toISOString() }];
  if (next.reduce((n, u) => n + u.ics.length, 0) > MAX) return NextResponse.json({ error: "That's more calendar data than the app can hold. Remove an upload first" }, { status: 400 });
  const res = NextResponse.json({ ok: true, name: label, events });
  await writeUploads(res, next);
  return res;
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get("id");
  const list = await readUploads(req);
  const res = NextResponse.json({ ok: true });
  await writeUploads(res, list.filter((u) => u.id !== id));
  return res;
}
