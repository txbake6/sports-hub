import { NextResponse } from "next/server";
import { cookieOpts, seal, unseal } from "./seal";
import { HEJA_COOKIE, ensureToken } from "./heja";

// Runs fn with a live Heja session and saves the (possibly refreshed) session back to its cookie.
export async function withHeja(req, fn) {
  const saved = unseal(req.cookies.get(HEJA_COOKIE)?.value);
  if (!saved) return NextResponse.json({ connected: false, error: "Heja isn't connected" }, { status: 401 });
  let session;
  try {
    session = await ensureToken(saved);
  } catch (e) {
    const res = NextResponse.json({ connected: false, error: "Heja sign-in expired, connect it again" }, { status: 401 });
    if (e.status === 401 || e.status === 403) res.cookies.delete(HEJA_COOKIE);
    return res;
  }
  let res;
  try {
    res = NextResponse.json({ connected: true, ...(await fn(session)) });
  } catch (e) {
    res = NextResponse.json({ connected: true, error: e.message }, { status: 502 });
  }
  res.cookies.set(HEJA_COOKIE, seal(session), cookieOpts(60 * 60 * 24 * 365));
  return res;
}
