import { NextResponse } from "next/server";
import { HEJA_COOKIE, HEJA_REF_COOKIE, verifyCode } from "../../../../lib/heja";
import { cookieOpts, seal, unseal } from "../../../../lib/seal";

export async function POST(req) {
  const { code } = await req.json().catch(() => ({}));
  const ref = unseal(req.cookies.get(HEJA_REF_COOKIE)?.value);
  if (!ref) return NextResponse.json({ error: "The code expired, ask Heja for a new one" }, { status: 400 });
  if (!/^\d{4}$/.test(code || "")) return NextResponse.json({ error: "The code is 4 digits" }, { status: 400 });
  try {
    const session = await verifyCode(ref, code);
    if (!session.refreshToken && !session.cookie) throw new Error("Heja signed in but didn't return a session");
    const res = NextResponse.json({ ok: true });
    res.cookies.set(HEJA_COOKIE, seal(session), cookieOpts(60 * 60 * 24 * 365));
    res.cookies.delete(HEJA_REF_COOKIE);
    return res;
  } catch (e) {
    const wrongCode = e.status === 400 || e.status === 401 || e.status === 403;
    return NextResponse.json({ error: wrongCode ? "That code didn't work, check it or ask for a new one" : e.message }, { status: 502 });
  }
}
