import { NextResponse } from "next/server";
import { listGroups } from "../../../lib/groupme";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!process.env.GROUPME_TOKEN) return NextResponse.json({ groups: [] });
  try {
    return NextResponse.json({ groups: await listGroups() });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
