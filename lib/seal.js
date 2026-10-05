import crypto from "node:crypto";

// Encrypts small secrets (sign-in tokens) so they can live in httpOnly cookies without a database.
function key() {
  return crypto.createHash("sha256").update(`sports-hub-seal|${process.env.APP_PASSWORD}`).digest();
}

export function seal(value) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(JSON.stringify(value), "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64url");
}

export function unseal(sealed) {
  if (!sealed) return null;
  try {
    const buf = Buffer.from(sealed, "base64url");
    const d = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString("utf8"));
  } catch {
    return null;
  }
}

export const cookieOpts = (maxAge) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge,
});
