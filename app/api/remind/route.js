import { NextResponse } from "next/server";
import { REMIND_COOKIE, loadRemindFeed, signInRemind } from "../../../lib/remind";
import { withRemind } from "../../../lib/remindRoute";
import { vaultDelete, vaultGet, vaultSet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await vaultGet(req, REMIND_COOKIE))) return NextResponse.json({ connected: false, items: [] });
  return withRemind(req, async (s) => ({ items: await loadRemindFeed(s) }));
}

// Body: { email, password }. The password goes to Remind once and is not stored.
export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email?.includes("@") || !password) return NextResponse.json({ error: "Enter your Remind email and password" }, { status: 400 });
  try {
    const session = await signInRemind(email.trim(), password);
    const res = NextResponse.json({ ok: true, name: session.name });
    await vaultSet(res, REMIND_COOKIE, session);
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 400 : 502 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  await vaultDelete(res, REMIND_COOKIE);
  return res;
}
