import { NextResponse } from "next/server";
import { vaultDelete, vaultGet, vaultSet } from "./vault";
import { TS1_COOKIE } from "./teamsnapone";

// Runs fn with the saved TeamSnap ONE session and saves it back if TeamSnap refreshed its cookies.
export async function withTeamsnapOne(req, fn) {
  const session = await vaultGet(req, TS1_COOKIE);
  if (!session) return NextResponse.json({ connected: false, error: "TeamSnap ONE isn't connected" }, { status: 401 });
  const before = JSON.stringify(session);
  let res;
  try {
    res = NextResponse.json({ connected: true, ...(await fn(session)) });
  } catch (e) {
    if (e.status === 401) {
      res = NextResponse.json({ connected: false, error: "TeamSnap ONE sign-in expired, connect it again" }, { status: 401 });
      await vaultDelete(res, TS1_COOKIE);
      return res;
    }
    res = NextResponse.json({ connected: true, error: e.message }, { status: 502 });
  }
  if (JSON.stringify(session) !== before) await vaultSet(res, TS1_COOKIE, session);
  return res;
}
