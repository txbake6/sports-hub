import { NextResponse } from "next/server";
import { loadHejaPosts, HEJA_COOKIE } from "../../../lib/heja";
import { withHeja } from "../../../lib/hejaRoute";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!req.cookies.get(HEJA_COOKIE)) return NextResponse.json({ connected: false, items: [] });
  return withHeja(req, async (s) => ({ items: await loadHejaPosts(s) }));
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(HEJA_COOKIE);
  return res;
}
