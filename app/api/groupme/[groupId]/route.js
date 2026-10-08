import { NextResponse } from "next/server";
import { groupMessages, sendGroupMessage } from "../../../../lib/groupme";
import { groupmeToken } from "../../../../lib/settings";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { groupId } = await params;
  try {
    return NextResponse.json({ messages: await groupMessages(groupmeToken(req), groupId) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}

export async function POST(req, { params }) {
  const { groupId } = await params;
  const { text } = await req.json().catch(() => ({}));
  if (!text?.trim()) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  try {
    return NextResponse.json({ message: await sendGroupMessage(groupmeToken(req), groupId, text.trim().slice(0, 1000)) });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 502 });
  }
}
