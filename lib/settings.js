import { vaultGet, vaultSet } from "./vault";

// Things you set up inside the app (pasted calendar links, GroupMe key).
export const SETTINGS_COOKIE = "sh_settings";

export async function readSettings(req) {
  const s = (await vaultGet(req, SETTINGS_COOKIE)) || {};
  return {
    feeds: Array.isArray(s.feeds) ? s.feeds : [],
    groupmeToken: s.groupmeToken || null,
    styles: s.styles && typeof s.styles === "object" ? s.styles : {},
  };
}

export async function writeSettings(res, settings) {
  await vaultSet(res, SETTINGS_COOKIE, settings);
}

export const groupmeToken = async (req) => process.env.GROUPME_TOKEN || (await readSettings(req)).groupmeToken;

// Uploaded .ics files are kept apart from settings because they can be large.
export const UPLOADS_KEY = "sh_uploads";
export const readUploads = async (req) => (await vaultGet(req, UPLOADS_KEY)) || [];
export const writeUploads = (res, list) => vaultSet(res, UPLOADS_KEY, list);
