import { cookieOpts, seal, unseal } from "./seal";

// Things you set up inside the app (pasted calendar links, GroupMe key), kept in an
// encrypted cookie on this browser so nothing has to be typed into Vercel.
export const SETTINGS_COOKIE = "sh_settings";

export function readSettings(req) {
  const s = unseal(req.cookies.get(SETTINGS_COOKIE)?.value) || {};
  return { feeds: Array.isArray(s.feeds) ? s.feeds : [], groupmeToken: s.groupmeToken || null };
}

export function writeSettings(res, settings) {
  res.cookies.set(SETTINGS_COOKIE, seal(settings), cookieOpts(60 * 60 * 24 * 365 * 5));
}

export const groupmeToken = (req) => process.env.GROUPME_TOKEN || readSettings(req).groupmeToken;
