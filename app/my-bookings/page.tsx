import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { flattenBookings, type Slot } from "@/lib/bookings";
import LogoutButton from "./logout-button";
import BookingsList from "./bookings-list";

export default async function MyBookingsPage() {
  const session = await auth();
  const email = session?.user?.email;

  if (!email) {
    redirect("/login");
  }

  const backendBase = process.env.BACKEND_SERVER || "";
  const apiKey = process.env.BACKEND_API_KEY || "";

  const res = await fetch(
    `${backendBase}/api/slots/by-email?email=${encodeURIComponent(email)}`,
    { method: "GET", headers: { "X-Api-Key": apiKey }, cache: "no-store" }
  );

  const { data } = res.ok ? await res.json().catch(() => ({ data: [] })) : { data: [] };
  const slots: Slot[] = Array.isArray(data) ? data : [];
  const bookings = flattenBookings(slots).sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date); // latest date first
    if (dateCompare !== 0) return dateCompare;
    return a.startTime.localeCompare(b.startTime); // earliest start time first within the day
  });

  return (
    <section className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My bookings</h1>
          <p className="mt-1 text-sm text-[var(--foreground)]/70">{email}</p>
        </div>
        <LogoutButton />
      </div>

      <BookingsList bookings={bookings} />
    </section>
  );
}
