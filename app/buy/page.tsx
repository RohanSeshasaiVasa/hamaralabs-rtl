"use client";

import { useEffect, useMemo, useState } from "react";

export default function BuyPage() {
  const AMOUNT = process.env.NEXT_PUBLIC_AMOUNT || 50;

  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("+91 ");
  const [submitting, setSubmitting] = useState(false);
  const [schedules, setSchedules] = useState<
    Array<{
      id: string;
      userId: string;
      date: string; // ISO date
      timeSlots: Array<{
        id: string;
        startTime: string; // "HH:MM"
        endTime: string; // "HH:MM"
        maxSlots: number;
        bookedSlots: number;
      }>;
      createdAt?: string;
      updatedAt?: string;
    }>
  >([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<{
    date: string; // ISO date
    time: string; // "HH:mm-HH:mm"
  } | null>(null);

  const paymentPortal = process.env.NEXT_PUBLIC_PAYMENT_PORTAL || "https://hamaralabs.com";
  const merchantId = "${merchantId}";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://hamaralabs.com";

  const merchantTransactionId = useMemo(() => `MT${Date.now()}`, []);
  const merchantUserId = useMemo(() => `MUI${Date.now()}`, []);
  const docId = useMemo(() => `BOOK${Date.now()}`, []);

  const onBuyClick = () => setOpen(true);

  // Fetch schedules when the popup opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const res = await fetch(
          `https://calendar.hamaralabs.com/api/schedules/public/${process.env.NEXT_PUBLIC_CALENDAR_USER || "mohan487"}?leadMinutes=1`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`Failed to load slots (${res.status})`);
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data)) {
          setSchedules(data);
        } else {
          setSchedules([]);
        }
      } catch (e: any) {
        if (!cancelled) setSlotsError(e?.message || "Failed to load slots");
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      alert("Email is required.");
      return;
    }
    if (!phone.trim()) {
      alert("Phone number is required.");
      return;
    }
    if (!selectedSlot) {
      alert("Please select a slot.");
      return;
    }
    if (!merchantId) {
      alert("Missing NEXT_PUBLIC_MERCHANT_ID");
      return;
    }
    if (!siteUrl) {
      alert("Missing NEXT_PUBLIC_SITE_URL");
      return;
    }

    setSubmitting(true);

    if (typeof window !== "undefined") {
      sessionStorage.setItem(
        "bookingPayload",
        JSON.stringify({
          email,
          phone,
          amount: AMOUNT,
          docId,
          merchantId,
          merchantTransactionId,
      selectedSlot,
        })
      );
    }

    const redirectUrl =
      `${siteUrl}/payments?amount=${AMOUNT}` +
      `&docId=${encodeURIComponent(docId)}` +
      `&merchantTransactionId=${encodeURIComponent(merchantTransactionId)}` +
      `&merchantId=${merchantId}` +
      `&email=${encodeURIComponent(email)}` +
    `&phone=${encodeURIComponent(phone)}` +
    `&slotDate=${encodeURIComponent(selectedSlot.date)}` +
    `&slotTime=${encodeURIComponent(selectedSlot.time)}`;

    const checkoutUrl =
      `${paymentPortal}/payment/checkout` +
      `?amount=${AMOUNT}` +
      `&merchantTransactionId=${encodeURIComponent(merchantTransactionId)}` +
      `&merchantUserId=${encodeURIComponent(merchantUserId)}` +
      `&redirectUrl=${encodeURIComponent(redirectUrl)}`;

    window.location.href = checkoutUrl;
  };

  return (
    <section className="py-10">
      <div className="mb-8 text-4xl font-bold text-center text-[var(--foreground)]">Hands-on activity</div>
      <div className="mx-auto max-w-2xl rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-[var(--foreground)]/10">
            <svg viewBox="0 0 24 24" fill="none" className="size-5">
              <path d="M3 7h18M6 12h12M9 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold">Pick your slot</h1>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <div className="text-sm text-[var(--foreground)]/60">Amount</div>
            <div className="mt-1 text-4xl font-bold">₹{AMOUNT}</div>
          </div>
          <div className="flex items-end">
            <button
              onClick={onBuyClick}
              className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3 text-[var(--background)] font-medium shadow-sm transition hover:opacity-90 active:opacity-80"
            >
              Buy
            </button>
          </div>
        </div>

        <ul className="mt-6 space-y-2 text-sm text-[var(--foreground)]/65">
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-emerald-500" /> Secure checkout
          </li>
          <li className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-sky-500" /> Instant confirmation
          </li>
        </ul>

        <div className="mt-8 rounded-2xl border border-[var(--foreground)]/10 bg-[var(--foreground)]/5 p-5">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">
            Why Parents Should Encourage Children to Engage in Hands-On Activities ?
          </h2>
          <div className="mt-2 space-y-4 text-sm leading-relaxed text-[var(--foreground)]/80">
            <p>
              In today’s world, many children spend most of their time consuming information passively—through
              screens, textbooks, or lectures. While these methods have their place, research and experience show
              that children benefit enormously when they engage in hands-on activities. Whether it’s cooking, building
              a model, gardening, or exploring basic science experiments, such activities can transform abstract
              concepts into concrete understanding.
            </p>
            <p>
              One powerful example comes from a simple household fact: in many countries, the mains electricity
              supply to homes is about 230 volts. A student might read that figure in a science book, but without
              context, it is just a number. Through safe, guided hands-on activities, a child can learn what that means
              in practical terms. For instance, they can use a battery-powered circuit kit to understand voltage,
              current, and resistance before comparing those small, safe voltages to the much higher and dangerous
              household level. The idea is not to expose children to actual mains electricity—that would be unsafe—but
              to use models and experiments that build intuition while reinforcing safety awareness.
            </p>
            <p className="font-medium">Hands-on learning offers several advantages:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Better Retention of Knowledge –</strong> When children actively participate in the learning
                process, they are far more likely to remember what they have learned.
              </li>
              <li>
                <strong>Development of Problem-Solving Skills –</strong> Real-world tasks rarely go perfectly the first
                time. Troubleshooting teaches critical thinking.
              </li>
              <li>
                <strong>Linking Theory to Reality –</strong> Abstract concepts gain meaning when connected to tangible
                experiences.
              </li>
              <li>
                <strong>Boosting Creativity and Curiosity –</strong> Hands-on work sparks new questions and exploration.
              </li>
              <li>
                <strong>Building Confidence and Independence –</strong> Completing a task fosters empowerment.
              </li>
            </ul>
            <p>
              For parents, encouraging hands-on learning doesn’t mean buying expensive kits. Everyday life offers
              countless opportunities—helping with repairs, cooking a meal, organizing tools, or building a birdhouse.
              The key is supervision, especially with potentially dangerous topics like electricity.
            </p>
            <p>
              In conclusion, hands-on activities are essential tools for building knowledge, critical thinking, and
              life skills. They turn textbook numbers—like 230 volts—into meaningful, practical understanding while
              instilling curiosity and confidence that last a lifetime.
            </p>
          </div>
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-6 shadow-xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Contact details</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-1 text-sm text-[var(--foreground)]/70 hover:bg-[var(--foreground)]/10"
              >
                Close
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
              A 15-minute slot will be booked based on your selected hours.
              <br/>
              After successful payment, you will get an email from <b>support@hamaralabs.com</b> (please check spam, if not found in inbox) regarding the session details.
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium">Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="mt-1 w-full rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--foreground)]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Phone number *</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number"
                  required
                  className="mt-1 w-full rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--foreground)]/30"
                />
              </div>

              <div>
                <label className="block text-sm font-medium">Select a slot *</label>
                <div className="mt-2 rounded-2xl border border-[var(--foreground)]/15 p-3">
                  {slotsLoading && (
                    <div className="text-sm text-[var(--foreground)]/70">Loading slots…</div>
                  )}
                  {slotsError && (
                    <div className="text-sm text-red-600">{slotsError}</div>
                  )}
                  {!slotsLoading && !slotsError && schedules.length === 0 && (
                    <div className="text-sm text-[var(--foreground)]/70">No slots available.</div>
                  )}

                  <div className="space-y-4">
                    {schedules.map((sch) => {
                      const dateLabel = new Date(sch.date).toLocaleDateString(undefined, {
                        weekday: "short",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      });
                      return (
                        <div key={sch.id} className="">
                          <div className="text-sm font-medium mb-2">{dateLabel}</div>
                          <div className="flex flex-wrap gap-2">
            {sch.timeSlots.map((ts) => {
                              const label = `${ts.startTime}-${ts.endTime}`;
                              const isFull = ts.bookedSlots >= ts.maxSlots;
                              const isSelected =
                                selectedSlot?.date === sch.date && selectedSlot?.time === label;
                              return (
                                <button
                                  key={ts.id}
                                  type="button"
                                  disabled={isFull}
                                  onClick={() => setSelectedSlot({ date: sch.date, time: label })}
                                  className={
                                    `rounded-xl border px-3 py-1.5 text-sm transition ` +
                                    (isFull
                                      ? "border-[var(--foreground)]/10 text-[var(--foreground)]/30 cursor-not-allowed"
                                      : isSelected
                                      ? "border-[var(--foreground)] bg-[var(--foreground)] text-[var(--background)]"
                                      : "border-[var(--foreground)]/20 hover:border-[var(--foreground)]/40")
                                  }
                                >
                                  {label} IST
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
        {selectedSlot && (
                  <div className="mt-2 text-xs text-[var(--foreground)]/70">
          Selected: {new Date(selectedSlot.date).toLocaleDateString()} — {selectedSlot.time} IST
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedSlot}
                className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3 text-[var(--background)] font-medium shadow-sm transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Redirecting…" : "Continue to payment"}
              </button>
            </form>
          </div>
        </div>
      )}
    <div className="mt-10 text-center text-sm text-[var(--foreground)]/70">
      Need help? Contact support at <a href="mailto:support@hamaralabs.com" className="underline">support@hamaralabs.com</a>
    </div>
  </section>
  );
}