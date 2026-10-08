import { NextResponse } from "next/server";
import { vaultDelete, vaultGet, vaultSet } from "./vault";
import { HEJA_COOKIE, ensureToken } from "./heja";

// Runs fn with a live Heja session and saves the (possibly refreshed) session back to its cookie.
export async function withHeja(req, fn) {
  const saved = await vaultGet(req, HEJA_COOKIE);
  if (!saved) return NextResponse.json({ connected: false, error: "Heja isn't connected" }, { status: 401 });
  let session;
  try {
    session = await ensureToken(saved);
  } catch (e) {
    const res = NextResponse.json({ connected: false, error: "Heja sign-in expired, connect it again" }, { status: 401 });
    if (e.status === 401 || e.status === 403) await vaultDelete(res, HEJA_COOKIE);
    return res;
  }
  let res;
  try {
    res = NextResponse.json({ connected: true, ...(await fn(session)) });
  } catch (e) {
    res = NextResponse.json({ connected: true, error: e.message }, { status: 502 });
  }
  await vaultSet(res, HEJA_COOKIE, session);
  return res;
}
