import { NextResponse } from "next/server";
import { vaultGet, vaultSet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

// When each chat or post was last opened in this app, shared across devices, so Messages can
// mark what's new. The first visit sets a starting point, so older messages don't all show as new.
const KEY = "sh_seen";
const MAX = 400;

async function read(req) {
  const s = (await vaultGet(req, KEY)) || {};
  return { baseline: s.baseline || null, seen: s.seen && typeof s.seen === "object" ? s.seen : {} };
}

export async function GET(req) {
  const s = await read(req);
  const res = NextResponse.json(s.baseline ? s : { ...s, baseline: new Date().toISOString() });
  if (!s.baseline) await vaultSet(res, KEY, { ...s, baseline: new Date().toISOString() });
  return res;
}

// Body: { id } — mark that chat or post as read now.
export async function POST(req) {
  const { id } = await req.json().catch(() => ({}));
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const s = await read(req);
  const seen = { ...s.seen, [String(id).slice(0, 200)]: new Date().toISOString() };
  const trimmed = Object.fromEntries(Object.entries(seen).sort((a, b) => b[1].localeCompare(a[1])).slice(0, MAX));
  const next = { baseline: s.baseline || new Date().toISOString(), seen: trimmed };
  const res = NextResponse.json(next);
  await vaultSet(res, KEY, next);
  return res;
}
