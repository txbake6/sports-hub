import { NextResponse } from "next/server";
import { TS1_COOKIE, loadTeamsnapOneFeed, signInTeamsnapOne } from "../../../lib/teamsnapone";
import { withTeamsnapOne } from "../../../lib/ts1Route";
import { vaultDelete, vaultGet, vaultSet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await vaultGet(req, TS1_COOKIE))) return NextResponse.json({ connected: false, items: [] });
  return withTeamsnapOne(req, async (s) => ({ items: await loadTeamsnapOneFeed(s) }));
}

// Body: { email, password }. The password goes to TeamSnap once and is not stored.
export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email?.includes("@") || !password) return NextResponse.json({ error: "Enter your TeamSnap email and password" }, { status: 400 });
  try {
    const session = await signInTeamsnapOne(email.trim(), password);
    const res = NextResponse.json({ ok: true, name: session.name });
    await vaultSet(res, TS1_COOKIE, session);
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 400 : 502 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  await vaultDelete(res, TS1_COOKIE);
  return res;
}
