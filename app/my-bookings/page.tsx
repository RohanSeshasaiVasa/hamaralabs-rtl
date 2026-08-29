import { redirect } from "next/navigation";
import { auth } from "@/auth";
import LogoutButton from "./logout-button";

type Booking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  guestName: string;
  guestEmail: string;
  notes?: string | null;
  status: string;
};

type Slot = {
  id: string;
  merchantTransactionId: string;
  email: string;
  amount: number;
  status: string;
  createdAt: string;
  bookings: Booking[];
};

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
  const bookings = slots
    .flatMap((slot) => slot.bookings ?? [])
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));

  return (
    <section className="py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">My bookings</h1>
          <p className="mt-1 text-sm text-[var(--foreground)]/70">{email}</p>
        </div>
        <LogoutButton />
      </div>

      {bookings.length === 0 ? (
        <div className="rounded-2xl border border-[var(--foreground)]/10 p-6 text-sm text-[var(--foreground)]/70">
          No bookings found.
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <div key={b.id} className="rounded-2xl border border-[var(--foreground)]/10 p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {new Date(b.date).toLocaleDateString(undefined, {
                    weekday: "short",
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </div>
                <span
                  className={
                    "rounded-full px-3 py-1 text-xs font-medium " +
                    (b.status === "CONFIRMED"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-[var(--foreground)]/10 text-[var(--foreground)]/70")
                  }
                >
                  {b.status}
                </span>
              </div>
              <div className="mt-1 text-sm text-[var(--foreground)]/70">
                {b.startTime}–{b.endTime} IST
              </div>
              {b.notes && (
                <div className="mt-2 text-sm text-[var(--foreground)]/60">{b.notes}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
