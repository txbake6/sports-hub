import { NextResponse } from "next/server";
import { loadPlaymetricsThread, sendPlaymetricsMessage } from "../../../../lib/playmetrics";
import { withPlaymetrics } from "../../../../lib/pmRoute";

export const dynamic = "force-dynamic";

const threadOf = (req) => new URL(req.url).searchParams.get("thread") || "";

export async function GET(req) {
  const thread = threadOf(req);
  if (!thread) return NextResponse.json({ error: "Missing chat" }, { status: 400 });
  return withPlaymetrics(req, async (s) => ({ messages: await loadPlaymetricsThread(s, thread) }));
}

export async function POST(req) {
  const thread = threadOf(req);
  const { text } = await req.json().catch(() => ({}));
  if (!thread || !text?.trim()) return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  return withPlaymetrics(req, async (s) => ({ message: await sendPlaymetricsMessage(s, thread, text.trim().slice(0, 4000)) }));
}
