import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { flattenBookings, isBookingActiveNow, type Slot } from "@/lib/bookings";
import { ensureChatwootConversation, hashIdentifier } from "@/lib/chatwoot";

export async function GET(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const bookingId = url.searchParams.get("bookingId");
  if (!bookingId) {
    return NextResponse.json({ message: "bookingId is required" }, { status: 400 });
  }
  const sourceId = url.searchParams.get("sourceId");

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
  // Scoping the search to bookings under the caller's own email is what stands in for the
  // `booking.userId !== req.user.id` ownership check in the reference implementation.
  const booking = flattenBookings(slots).find((b) => b.id === bookingId);

  if (!booking || !isBookingActiveNow(booking)) {
    return NextResponse.json({ status: "inactive" });
  }

  // guestName currently holds the booking email rather than a display name (a pre-existing
  // quirk elsewhere in the booking flow) — fall back to the email itself either way.
  const name = booking.guestName || email;

  // Two-phase: the first call (no sourceId yet) just reports eligibility so the client can load
  // the widget and call setUser. Only once that's done does the widget expose its own
  // contact_inbox's sourceId (via its cw_conversation cookie) — the client sends it back in a
  // second call, and only then can we attach the conversation to the inbox the widget actually
  // reads from.
  if (sourceId) {
    try {
      await ensureChatwootConversation({ email, name, bookingId, sourceId });
    } catch (err) {
      console.error("Failed to set up Chatwoot conversation:", err);
    }
    return NextResponse.json({ status: "active" });
  }

  return NextResponse.json({ status: "active", email, name, identifierHash: hashIdentifier(email) });
}
