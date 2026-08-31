import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { flattenBookings, isBookingActiveNow, type Slot } from "@/lib/bookings";
import { getChatSession, resolveVisitor } from "@/lib/libredesk";

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ status: "inactive" }, { status: 401 });
  }

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json({ message: "bookingId is required" }, { status: 400 });
  }

  const backendBase = process.env.BACKEND_SERVER || "";
  const apiKey = process.env.BACKEND_API_KEY || "";

  const res = await fetch(
    `${backendBase}/api/slots/by-email?email=${encodeURIComponent(email)}`,
    { method: "GET", headers: { "X-Api-Key": apiKey }, cache: "no-store" }
  );

  if (!res.ok) {
    return NextResponse.json({ status: "inactive" });
  }

  const { data } = await res.json().catch(() => ({ data: [] }));
  const slots: Slot[] = Array.isArray(data) ? data : [];
  // Scoping the lookup to bookings under the caller's own email, then requiring the booking
  // to be active right now, is what stands in for a booking.userId !== req.user.id check.
  const booking = flattenBookings(slots).find((b) => b.id === bookingId);

  if (!booking || !isBookingActiveNow(booking)) {
    return NextResponse.json({ status: "inactive" });
  }

  const visitor = resolveVisitor(email);

  try {
    const chatSession = await getChatSession(visitor);
    return NextResponse.json({ status: "active", ...chatSession });
  } catch (err) {
    console.error("[libredesk] session failed", err);
    return NextResponse.json({ status: "inactive" });
  }
}
