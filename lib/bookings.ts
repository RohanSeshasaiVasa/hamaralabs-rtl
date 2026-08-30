export type Booking = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  guestName: string;
  guestEmail: string;
  notes?: string | null;
  status: string;
  completed?: boolean;
};

export type Slot = {
  id: string;
  merchantTransactionId: string;
  email: string;
  amount: number;
  status: string;
  createdAt: string;
  completed?: boolean;
  bookings: Booking[];
};

export function flattenBookings(slots: Slot[]): Booking[] {
  return slots.flatMap((slot) =>
    (slot.bookings ?? []).map((booking) => ({
      ...booking,
      completed: booking.completed ?? slot.completed,
    }))
  );
}

const IST_TIME_ZONE = "Asia/Kolkata";

const istDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: IST_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function isBookingActiveNow(
  booking: Pick<Booking, "date" | "startTime" | "endTime" | "completed">,
  now: Date = new Date()
): boolean {
  if (booking.completed) return false;

  const bookingDatePart = booking.date.split("T")[0];
  const todayPart = istDateFormatter.format(now);
  if (bookingDatePart !== todayPart) return false;

  const start = new Date(`${bookingDatePart}T${booking.startTime}:00+05:30`);
  const end = new Date(`${bookingDatePart}T${booking.endTime}:00+05:30`);
  return now >= start && now <= end;
}
