// Single-user password gate. Set APP_PASSWORD in Vercel; until it is set, nobody can get in.
// The cookie holds a hash of APP_PASSWORD, never the password itself.
export const COOKIE = "sh_auth";

export async function tokenFor(password) {
  const data = new TextEncoder().encode(`sports-hub:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("hex");
}

export async function isAuthed(cookieValue) {
  const pw = process.env.APP_PASSWORD;
  if (!pw || !cookieValue) return false;
  return cookieValue === (await tokenFor(pw));
}
