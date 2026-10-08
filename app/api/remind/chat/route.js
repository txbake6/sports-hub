import { NextResponse } from "next/server";
import { loadRemindThread, sendRemindMessage } from "../../../../lib/remind";
import { withRemind } from "../../../../lib/remindRoute";

export const dynamic = "force-dynamic";

const chatOf = (req) => new URL(req.url).searchParams.get("chat") || "";

export async function GET(req) {
  const chat = chatOf(req);
  if (!chat) return NextResponse.json({ error: "Missing chat" }, { status: 400 });
  return withRemind(req, async (s) => ({ messages: await loadRemindThread(s, chat) }));
}

export async function POST(req) {
  const chat = chatOf(req);
  const { text } = await req.json().catch(() => ({}));
  if (!chat || !text?.trim()) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  return withRemind(req, async (s) => sendRemindMessage(s, chat, text.trim().slice(0, 4000)));
}
