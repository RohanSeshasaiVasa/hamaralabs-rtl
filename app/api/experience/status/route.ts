import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { flattenBookings, type Slot } from "@/lib/bookings";

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const bookingId = new URL(req.url).searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json({ message: "bookingId is required" }, { status: 400 });
  }

  try {
    const backendBase = process.env.BACKEND_SERVER || "";
    const apiKey = process.env.BACKEND_API_KEY || "";

    const res = await fetch(
      `${backendBase}/api/slots/by-email?email=${encodeURIComponent(email)}`,
      { method: "GET", headers: { "X-Api-Key": apiKey }, cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.json({ completed: false });
    }

    const { data } = await res.json().catch(() => ({ data: [] }));
    const slots: Slot[] = Array.isArray(data) ? data : [];
    const booking = flattenBookings(slots).find((b) => b.id === bookingId);
    return NextResponse.json({ completed: Boolean(booking?.completed) });
  } catch {
    return NextResponse.json({ completed: false });
  }
}
