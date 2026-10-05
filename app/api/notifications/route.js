import { NextResponse } from "next/server";
import { emailConfigured, loadNotifications } from "../../../lib/email";
import { TS_COOKIE, loadTeamsnapMessages, openToken, teamsnapConfigured } from "../../../lib/teamsnap";

export const dynamic = "force-dynamic";

// Everything that isn't a GroupMe chat: TeamSnap messages from its API, plus
// notification emails from TeamSnap, PlayMetrics and Heja.
export async function GET(req) {
  const errors = [];
  const sealed = req.cookies.get(TS_COOKIE)?.value;
  const token = sealed ? openToken(sealed) : null;
  const [emails, teamsnap] = await Promise.all([
    loadNotifications().catch((e) => (errors.push({ source: "Gmail", error: e.message }), [])),
    token
      ? loadTeamsnapMessages(token).catch((e) => (errors.push({ source: "TeamSnap", error: e.message }), []))
      : [],
  ]);
  return NextResponse.json({
    items: [...teamsnap, ...emails].sort((a, b) => b.at.localeCompare(a.at)),
    errors,
    email: emailConfigured(),
    teamsnap: { available: teamsnapConfigured(), connected: Boolean(token) },
  });
}
