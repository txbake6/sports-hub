import { cookieOpts, seal, unseal } from "./seal";

// Where saved connections live (GroupMe key, calendar links, Heja/TeamSnap sign-ins).
// With a Redis database attached in Vercel (Storage > Upstash for Redis), every phone and computer
// shares them. Without one, they fall back to an encrypted cookie in each browser.
// Values are encrypted either way.
const url = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const sharedStorage = () => Boolean(url() && token());

const KEY = (name) => `sports-hub:${name}`;
const YEAR = 60 * 60 * 24 * 365;

async function redis(command) {
  const res = await fetch(url(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Database error ${res.status}`);
  return (await res.json()).result;
}

export async function vaultGet(req, name) {
  const fromCookie = unseal(req.cookies.get(name)?.value);
  if (!sharedStorage()) return fromCookie;
  const stored = unseal(await redis(["GET", KEY(name)]));
  if (stored?.__removed) return null; // disconnected on some device; ignore old cookies elsewhere
  if (stored !== null && stored !== undefined) return stored;
  // First visit after the database was attached: move this browser's saved connection into it.
  if (fromCookie !== null && fromCookie !== undefined) await redis(["SET", KEY(name), seal(fromCookie)]);
  return fromCookie;
}

export async function vaultSet(res, name, value) {
  if (sharedStorage()) await redis(["SET", KEY(name), seal(value)]);
  else res.cookies.set(name, seal(value), cookieOpts(YEAR * 5));
}

export async function vaultDelete(res, name) {
  if (sharedStorage()) await redis(["SET", KEY(name), seal({ __removed: true })]);
  res.cookies.delete(name);
}
