import { NextResponse } from "next/server";
import { loadSchedule } from "../../../lib/schedule";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadSchedule());
}
