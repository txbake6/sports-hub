import { NextResponse } from "next/server";
import { TS_COOKIE, exchangeCode } from "../../../../lib/teamsnap";
import { vaultSet } from "../../../../lib/vault";

export async function GET(req) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  if (!state || state !== req.cookies.get("sh_ts_state")?.value) {
    return NextResponse.json({ error: "Sign-in check failed, try again" }, { status: 400 });
  }
  try {
    const token = await exchangeCode(req, url.searchParams.get("code"));
    const res = NextResponse.redirect(new URL("/?tab=messages", req.url));
    await vaultSet(res, TS_COOKIE, token);
    res.cookies.delete("sh_ts_state");
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
