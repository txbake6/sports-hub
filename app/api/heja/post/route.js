import { NextResponse } from "next/server";
import { commentOnHejaPost, loadHejaPost } from "../../../../lib/heja";
import { withHeja } from "../../../../lib/hejaRoute";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const q = new URL(req.url).searchParams;
  return withHeja(req, async (s) => ({ post: await loadHejaPost(s, q.get("teamid"), q.get("postid")) }));
}

export async function POST(req) {
  const { teamid, postid, text } = await req.json().catch(() => ({}));
  if (!text?.trim()) return NextResponse.json({ error: "Comment is empty" }, { status: 400 });
  return withHeja(req, async (s) => {
    await commentOnHejaPost(s, teamid, postid, text.trim().slice(0, 2000));
    return { post: await loadHejaPost(s, teamid, postid) };
  });
}
