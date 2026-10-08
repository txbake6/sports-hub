import { NextResponse } from "next/server";
import { REMIND_COOKIE, loadRemindFeed, signInRemind } from "../../../lib/remind";
import { withRemind } from "../../../lib/remindRoute";
import { cookieOpts, seal, unseal } from "../../../lib/seal";
import { vaultDelete, vaultGet, vaultSet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await vaultGet(req, REMIND_COOKIE))) return NextResponse.json({ connected: false, items: [] });
  return withRemind(req, async (s) => ({ items: await loadRemindFeed(s) }));
}

const PENDING = "sh_remind_pending";

// Body: { email, password, code? }. The password goes to Remind and is not stored.
// If Remind asks to confirm the device, the half-done sign-in waits in a short-lived cookie for the code.
export async function POST(req) {
  const { email, password, code } = await req.json().catch(() => ({}));
  if (!email?.includes("@") || !password) return NextResponse.json({ error: "Enter your Remind email and password" }, { status: 400 });
  const pending = code ? unseal(req.cookies.get(PENDING)?.value) : null;
  if (code && !pending) return NextResponse.json({ error: "That code expired. Start over to get a new one", restart: true }, { status: 400 });
  try {
    const session = await signInRemind(email.trim(), password, { pending, code: code ? String(code).trim() : undefined });
    const res = NextResponse.json({ ok: true, name: session.name });
    await vaultSet(res, REMIND_COOKIE, session);
    res.cookies.delete(PENDING);
    return res;
  } catch (e) {
    if (e.needsCode) {
      const res = NextResponse.json({ needsCode: true });
      res.cookies.set(PENDING, seal(e.session), cookieOpts(15 * 60));
      return res;
    }
    return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 400 : 502 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  await vaultDelete(res, REMIND_COOKIE);
  return res;
}
