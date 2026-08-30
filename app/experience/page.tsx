import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { flattenBookings, isBookingActiveNow, type Slot } from "@/lib/bookings";
import ExperienceStage from "./experience-stage";

export default async function ExperiencePage() {
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
  const activeBooking = flattenBookings(slots).find((booking) => isBookingActiveNow(booking));

  if (!activeBooking) {
    redirect("/my-bookings");
  }

  return <ExperienceStage bookingId={activeBooking.id} />;
}
