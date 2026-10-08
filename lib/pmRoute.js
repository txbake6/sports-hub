import { NextResponse } from "next/server";
import { vaultDelete, vaultGet, vaultSet } from "./vault";
import { PM_COOKIE, ensurePlaymetrics } from "./playmetrics";

// Runs fn with a live PlayMetrics session and saves the (possibly refreshed) session back.
export async function withPlaymetrics(req, fn) {
  const saved = await vaultGet(req, PM_COOKIE);
  if (!saved) return NextResponse.json({ connected: false, error: "PlayMetrics isn't connected" }, { status: 401 });
  let session;
  const before = JSON.stringify(saved);
  try {
    session = await ensurePlaymetrics(saved);
  } catch (e) {
    const res = NextResponse.json({ connected: false, error: "PlayMetrics sign-in expired, connect it again" }, { status: 401 });
    if (e.status === 401) await vaultDelete(res, PM_COOKIE);
    return res;
  }
  let res;
  try {
    res = NextResponse.json({ connected: true, ...(await fn(session)) });
  } catch (e) {
    res = NextResponse.json({ connected: true, error: e.message }, { status: e.status === 401 ? 401 : 502 });
  }
  if (JSON.stringify(session) !== before) await vaultSet(res, PM_COOKIE, session);
  return res;
}
