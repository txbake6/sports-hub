import { NextResponse } from "next/server";
import { listGroups } from "../../../lib/groupme";
import { groupmeToken } from "../../../lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const token = await groupmeToken(req);
  if (!token) return NextResponse.json({ connected: false, groups: [] });
  try {
    return NextResponse.json({ connected: true, groups: await listGroups(token) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
