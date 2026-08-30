import { NextResponse } from "next/server";
import { sendBookingConfirmationEmail } from "@/lib/email";

export async function POST(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
    const body = await req.json();
    // Optional: idempotency check if merchantTransactionId is passed
    const mtx = body?.merchantTransactionId;
    if (mtx) {
      try {
        const checkRes = await fetch(
          `${backendBase}/api/bookings?merchantTransactionId=${encodeURIComponent(String(mtx))}`,
          { method: "GET", headers: { "content-type": "application/json" } }
        );
        if (checkRes.ok) {
          const existing = await checkRes.json().catch(() => null);
          const hasAny = Array.isArray(existing?.bookings)
            ? existing.bookings.length > 0
            : Array.isArray(existing)
            ? existing.length > 0
            : !!existing?.id;
          if (hasAny) {
            return NextResponse.json(
              { message: "Booking already exists for this merchantTransactionId" },
              { status: 409 }
            );
          }
        }
      } catch {
        // ignore errors and proceed
      }
    }

    const res = await fetch(`${backendBase}/api/bookings`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res
      .json()
      .catch(() => ({ message: "Invalid JSON from backend" }));

    if (res.ok) {
      const contactEmail = body?.contactEmail || body?.guestName;
      if (contactEmail && body?.date && body?.startTime && body?.endTime) {
        try {
          await sendBookingConfirmationEmail(contactEmail, {
            date: body.date,
            startTime: body.startTime,
            endTime: body.endTime,
          });
        } catch (err) {
          console.error("Failed to send booking confirmation email:", err);
        }
      }
    }

    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to create booking" },
      { status: 500 }
    );
  }
}
