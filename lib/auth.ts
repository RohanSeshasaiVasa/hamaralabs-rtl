import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "";

export const OTP_COOKIE = "otp_challenge";
export const SESSION_COOKIE = "session";
export const OTP_TTL_SECONDS = 10 * 60; // 10 minutes
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

function sign(payload: string) {
  return crypto.createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function createToken(data: Record<string, unknown>, ttlSeconds: number): string {
  const payload = JSON.stringify({ ...data, exp: Date.now() + ttlSeconds * 1000 });
  const encoded = Buffer.from(payload, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyToken<T extends { exp: number }>(token: string | undefined | null): T | null {
  if (!token) return null;
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expected = sign(encoded);
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function generateCode(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(`${code}:${SECRET}`).digest("hex");
}
