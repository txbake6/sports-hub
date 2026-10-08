import { NextResponse } from "next/server";
import { loadTeamsnapOneThread, sendTeamsnapOneMessage } from "../../../../lib/teamsnapone";
import { withTeamsnapOne } from "../../../../lib/ts1Route";

export const dynamic = "force-dynamic";

const cidOf = (req) => new URL(req.url).searchParams.get("cid") || "";

export async function GET(req) {
  const cid = cidOf(req);
  if (!cid) return NextResponse.json({ error: "Missing chat" }, { status: 400 });
  return withTeamsnapOne(req, async (s) => ({ messages: await loadTeamsnapOneThread(s, cid) }));
}

export async function POST(req) {
  const cid = cidOf(req);
  const { text } = await req.json().catch(() => ({}));
  if (!cid || !text?.trim()) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  return withTeamsnapOne(req, async (s) => ({ message: await sendTeamsnapOneMessage(s, cid, text.trim().slice(0, 4000)) }));
}
