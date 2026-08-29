import { NextResponse } from "next/server";
import { createToken, generateCode, hashCode, OTP_COOKIE, OTP_TTL_SECONDS } from "@/lib/auth";
import { sendVerificationEmail } from "@/lib/email";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ message: "A valid email is required" }, { status: 400 });
    }

    const backendBase = process.env.BACKEND_SERVER || "";
    const apiKey = process.env.BACKEND_API_KEY || "";

    const lookupRes = await fetch(
      `${backendBase}/api/slots/by-email?email=${encodeURIComponent(email)}`,
      { method: "GET", headers: { "X-Api-Key": apiKey }, cache: "no-store" }
    );

    if (!lookupRes.ok) {
      return NextResponse.json({ message: "Failed to look up user" }, { status: 502 });
    }

    const { data } = await lookupRes.json().catch(() => ({ data: [] }));
    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json({ message: "User not found" }, { status: 404 });
    }

    const code = generateCode();
    const token = createToken({ email, codeHash: hashCode(code) }, OTP_TTL_SECONDS);

    await sendVerificationEmail(email, code);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(OTP_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: OTP_TTL_SECONDS,
    });
    return response;
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to send verification code" },
      { status: 500 }
    );
  }
}
