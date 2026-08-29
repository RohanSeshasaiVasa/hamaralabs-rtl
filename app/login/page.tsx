"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/request-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Failed to send verification code");
      setStep("code");
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || "Invalid code");
      router.push("/my-bookings");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="py-10">
      <div className="mx-auto max-w-md rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">
          {step === "email" ? "Log in" : "Enter verification code"}
        </h1>
        <p className="mt-1 text-sm text-[var(--foreground)]/70">
          {step === "email"
            ? "Enter the email you used to book a slot."
            : `We sent a 6-digit code to ${email}.`}
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === "email" ? (
          <form className="mt-6 space-y-4" onSubmit={requestCode}>
            <div>
              <label className="block text-sm font-medium">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mt-1 w-full rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--foreground)]/30"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3 text-[var(--background)] font-medium shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send verification code"}
            </button>
          </form>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={verifyCode}>
            <div>
              <label className="block text-sm font-medium">Verification code</label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-3 py-2 outline-none focus:border-[var(--foreground)]/30"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-2xl bg-[var(--foreground)] px-5 py-3 text-[var(--background)] font-medium shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Verifying…" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              className="w-full text-center text-sm text-[var(--foreground)]/60 hover:underline"
            >
              Use a different email
            </button>
          </form>
        )}
      </div>
    </section>
  );
}
