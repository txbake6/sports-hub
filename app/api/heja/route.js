import { NextResponse } from "next/server";
import { loadHejaPosts, HEJA_COOKIE } from "../../../lib/heja";
import { withHeja } from "../../../lib/hejaRoute";
import { vaultDelete, vaultGet } from "../../../lib/vault";

export const dynamic = "force-dynamic";

export async function GET(req) {
  if (!(await vaultGet(req, HEJA_COOKIE))) return NextResponse.json({ connected: false, items: [] });
  return withHeja(req, async (s) => ({ items: await loadHejaPosts(s) }));
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  await vaultDelete(res, HEJA_COOKIE);
  return res;
}
