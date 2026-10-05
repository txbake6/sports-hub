import { NextResponse } from "next/server";
import { HEJA_REF_COOKIE, requestCode } from "../../../../lib/heja";
import { cookieOpts, seal } from "../../../../lib/seal";

export async function POST(req) {
  const { email } = await req.json().catch(() => ({}));
  if (!email?.includes("@")) return NextResponse.json({ error: "Enter the email you use for Heja" }, { status: 400 });
  try {
    const ref = await requestCode(email.trim());
    const res = NextResponse.json({ ok: true });
    res.cookies.set(HEJA_REF_COOKIE, seal(ref), cookieOpts(900));
    return res;
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
