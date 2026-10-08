import { NextResponse } from "next/server";
import { vaultDelete, vaultGet, vaultSet } from "./vault";
import { REMIND_COOKIE } from "./remind";

// Runs fn with the saved Remind session and saves it back if Remind refreshed its cookies.
export async function withRemind(req, fn) {
  const session = await vaultGet(req, REMIND_COOKIE);
  if (!session) return NextResponse.json({ connected: false, error: "Remind isn't connected" }, { status: 401 });
  const before = JSON.stringify(session);
  let res;
  try {
    res = NextResponse.json({ connected: true, ...(await fn(session)) });
  } catch (e) {
    if (e.status === 401) {
      res = NextResponse.json({ connected: false, error: "Remind sign-in expired, connect it again" }, { status: 401 });
      await vaultDelete(res, REMIND_COOKIE);
      return res;
    }
    res = NextResponse.json({ connected: true, error: e.message }, { status: 502 });
  }
  if (JSON.stringify(session) !== before) await vaultSet(res, REMIND_COOKIE, session);
  return res;
}
