"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { isBookingActiveNow, type Booking } from "@/lib/bookings";

type RemoteStatus = "checking" | "active" | "no";

export default function BookingsList({ bookings }: { bookings: Booking[] }) {
  const router = useRouter();
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus>("checking");

  useEffect(() => {
    let cancelled = false;

    const checkRemoteLabStatus = async () => {
      setRemoteStatus("checking");
      try {
        const response = await fetch("https://remote-labs.hamaralabs.com/", {
          method: "GET",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (cancelled) return;
        setRemoteStatus(response.ok ? "active" : "no");
      } catch {
        if (!cancelled) setRemoteStatus("no");
      }
    };

    checkRemoteLabStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnterExperience = async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Some browsers/contexts refuse this; the experience page still opens normally.
    }
    router.push("/experience");
  };

  if (bookings.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--foreground)]/10 p-6 text-sm text-[var(--foreground)]/70">
        No bookings found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {bookings.map((b) => (
        <div key={b.id} className="rounded-2xl border border-[var(--foreground)]/10 p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              {new Date(b.date).toLocaleDateString("en-US", {
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
          {b.notes && <div className="mt-2 text-sm text-[var(--foreground)]/60">{b.notes}</div>}

          {isBookingActiveNow(b) && (
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled={remoteStatus !== "active"}
                onClick={handleEnterExperience}
                className="rounded-xl bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-[var(--background)] shadow-sm transition hover:opacity-90 disabled:opacity-40"
              >
                Enter the experience
              </button>
              <span
                className={
                  "inline-flex items-center gap-1.5 text-xs font-medium " +
                  (remoteStatus === "active"
                    ? "text-emerald-600"
                    : remoteStatus === "checking"
                      ? "text-[var(--foreground)]/50"
                      : "text-red-600")
                }
              >
                <span
                  className={
                    "size-1.5 rounded-full " +
                    (remoteStatus === "active"
                      ? "bg-emerald-500"
                      : remoteStatus === "checking"
                        ? "bg-[var(--foreground)]/40"
                        : "bg-red-500")
                  }
                />
                {remoteStatus === "active"
                  ? "Lab active"
                  : remoteStatus === "checking"
                    ? "Checking lab…"
                    : "Lab inactive"}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
