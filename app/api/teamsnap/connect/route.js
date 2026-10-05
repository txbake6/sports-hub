import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl, teamsnapConfigured } from "../../../../lib/teamsnap";

export async function GET(req) {
  if (!teamsnapConfigured()) return NextResponse.json({ error: "TeamSnap app keys are not set" }, { status: 400 });
  const state = crypto.randomUUID();
  const res = NextResponse.redirect(authorizeUrl(req, state));
  res.cookies.set("sh_ts_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return res;
}
