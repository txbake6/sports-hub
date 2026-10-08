import { NextResponse } from "next/server";
import { PM_COOKIE, loadPlaymetricsFeed, signInPlaymetrics } from "../../../lib/playmetrics";
import { withPlaymetrics } from "../../../lib/pmRoute";
import { vaultDelete, vaultGet, vaultSet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await vaultGet(req, PM_COOKIE))) return NextResponse.json({ connected: false, items: [] });
  return withPlaymetrics(req, async (s) => ({ items: await loadPlaymetricsFeed(s) }));
}

// Body: { email, password }. The password goes to PlayMetrics once and is not stored.
export async function POST(req) {
  const { email, password } = await req.json().catch(() => ({}));
  if (!email?.includes("@") || !password) return NextResponse.json({ error: "Enter your PlayMetrics email and password" }, { status: 400 });
  try {
    const session = await signInPlaymetrics(email.trim(), password);
    const res = NextResponse.json({ ok: true, name: session.name });
    await vaultSet(res, PM_COOKIE, session);
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status === 401 ? 400 : 502 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  await vaultDelete(res, PM_COOKIE);
  return res;
}
