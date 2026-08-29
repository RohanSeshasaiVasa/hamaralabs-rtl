import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createToken,
  hashCode,
  verifyToken,
  OTP_COOKIE,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/auth";

export async function POST(req: Request) {
  try {
    const { email, code } = await req.json();
    if (!email || !code) {
      return NextResponse.json({ message: "Email and code are required" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const challenge = verifyToken<{ exp: number; email: string; codeHash: string }>(
      cookieStore.get(OTP_COOKIE)?.value
    );

    if (!challenge || challenge.email !== email || challenge.codeHash !== hashCode(String(code))) {
      return NextResponse.json({ message: "Invalid or expired code" }, { status: 400 });
    }

    const sessionToken = createToken({ email }, SESSION_TTL_SECONDS);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });
    response.cookies.delete(OTP_COOKIE);
    return response;
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to verify code" },
      { status: 500 }
    );
  }
}
