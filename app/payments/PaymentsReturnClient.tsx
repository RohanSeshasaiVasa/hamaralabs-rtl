
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import * as htmlToImage from "html-to-image";
import jsPDF from "jspdf";

type Status = "idle" | "checking" | "success" | "failed";

type Item = {
  description: string;
  quantity: number;
  price: number;
  total: number;
};
type ReceiptData = {
  date: string;
  merchantTransactionId: string;
  transactionId?: string;
  paidBy: string;
  paymentMethod?: string;
  items: Item[];
  amount: number;
  notes?: string;
};

export default function PaymentsReturnPage() {
  const params = useSearchParams();
  const router = useRouter();

  const qp = useMemo(() => Object.fromEntries(params.entries()), [params]);

  const [amount, setAmount] = useState<string | null>(null);
  const [email, setEmail] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [docId, setDocId] = useState<string>("");
  const [merchantId, setMerchantId] = useState<string>("");
  const [merchantTransactionId, setMerchantTransactionId] =
    useState<string>("");

  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("Verifying payment…");
  const [missing, setMissing] = useState<string[]>([]);

  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  const [selectedSlot, setSelectedSlot] = useState<{ date: string; time: string } | null>(null);

  useEffect(() => {
    const fromQuery = {
      amount: qp.amount ?? null,
      email: qp.email ?? "",
      phone: qp.phone ?? "",
      docId: qp.docId ?? "",
      merchantId: qp.merchantId ?? "",
      merchantTransactionId: qp.merchantTransactionId ?? "",
    };

    const raw =
      typeof window !== "undefined"
        ? sessionStorage.getItem("bookingPayload")
        : null;
    const fromSession = raw ? JSON.parse(raw) : {};

    setAmount(fromQuery.amount ?? fromSession.amount ?? null);
    setEmail(fromQuery.email ?? fromSession.email ?? "");
    setPhone(fromQuery.phone ?? fromSession.phone ?? "");
    setDocId(fromQuery.docId ?? fromSession.docId ?? "");
    setMerchantId(fromQuery.merchantId ?? fromSession.merchantId ?? "");
    setMerchantTransactionId(
      fromQuery.merchantTransactionId ?? fromSession.merchantTransactionId ?? ""
    );

    if (fromSession.selectedSlot) {
      setSelectedSlot(fromSession.selectedSlot);
    }
  }, [qp]);

  useEffect(() => {
    const verify = async () => {
      const missingKeys: string[] = [];
      if (!amount) missingKeys.push("amount");
      if (!merchantId) missingKeys.push("merchantId");
      if (!merchantTransactionId) missingKeys.push("merchantTransactionId");
      if (!phone) missingKeys.push("phone");

      if (missingKeys.length) {
        setMissing(missingKeys);
        setStatus("failed");
        setMessage("Missing required parameters.");
        return;
      }

      setStatus("checking");
      try {
        const res = await fetch(`/api/get-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ merchantTransactionId, merchantId }),
        });
        const json = await res.json();
        const code = json?.data?.code;

        if (code === "PAYMENT_SUCCESS") {
          // Prepare a single notes value to be used for both slot and booking
          const unifiedNotes = `Booking for ${email || phone}`;

          // 1) Create Slot on backend
          const slotPayload = {
            merchantTransactionId,
            merchantId,
            email,
            phone,
            amount: Number(amount),
            status: "PAID",
            items: [
              {
                description: "Remote Lab Booking",
                quantity: 1,
                price: Number(amount),
                total: Number(amount),
              },
            ],
            paidBy: email || phone,
            paymentMethod: json?.data?.paymentMethod || undefined,
            notes: unifiedNotes,
          } as any;

          const slotRes = await fetch("/api/slots", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(slotPayload),
          });
          if (!slotRes.ok) {
            // If slot already exists for this merchantTransactionId, treat as success and skip creating booking.
            if (slotRes.status === 409) {
              setStatus("success");
              setMessage("Payment successful! Your slot was already processed.");
              const now = new Date();
              const timeSlot = selectedSlot?.time || "";
              const dateIso = selectedSlot?.date || new Date().toISOString();
              const date = dateIso.split("T")[0];
              setReceiptData({
                date: now.toLocaleString(),
                merchantTransactionId,
                paidBy: email || phone,
                paymentMethod: json?.data?.paymentMethod,
                items: [
                  {
                    description: `Remote Lab Booking (${date} ${timeSlot})`,
                    quantity: 1,
                    price: Number(amount),
                    total: Number(amount),
                  },
                ],
                amount: Number(amount),
                notes: "Thank you for your payment.",
              });
              return; // Do not create booking again
            }
            const err = await slotRes.json().catch(() => ({}));
            throw new Error(err?.message || `Failed to create slot (${slotRes.status})`);
          }
          const slotJson = await slotRes.json();
          const slotId = slotJson?.slot?.id || slotJson?.id || slotJson?.slotId;
          if (!slotId) {
            // If backend signals already exists in body, treat as success and skip booking
            const alreadyExists =
              String(slotJson?.message || "").toLowerCase().includes("exist") ||
              slotJson?.alreadyExists === true;
            if (alreadyExists) {
              setStatus("success");
              setMessage("Payment successful! Your slot was already processed.");
              const now = new Date();
              const timeSlot = selectedSlot?.time || "";
              const dateIso = selectedSlot?.date || new Date().toISOString();
              const date = dateIso.split("T")[0];
              setReceiptData({
                date: now.toLocaleString(),
                merchantTransactionId,
                paidBy: email || phone,
                paymentMethod: json?.data?.paymentMethod,
                items: [
                  {
                    description: `Remote Lab Booking (${date} ${timeSlot})`,
                    quantity: 1,
                    price: Number(amount),
                    total: Number(amount),
                  },
                ],
                amount: Number(amount),
                notes: "Thank you for your payment.",
              });
              return; // Do not create booking again
            }
            throw new Error("Slot creation succeeded but no slotId returned.");
          }

          // 2) Create Booking that attaches to the Slot
          const username = process.env.NEXT_PUBLIC_CALENDAR_USER || "mohan487"; // backend’s public username you shared
          const dateIso = selectedSlot?.date || new Date().toISOString();
          const date = dateIso.split("T")[0];
          const timeSlot = selectedSlot?.time || "";
          if (!timeSlot) throw new Error("Missing selected time slot.");
          const [startTime, endTime] = timeSlot.split("-");
          if (!startTime || !endTime) throw new Error("Invalid selected time slot.");

          const bookingRes = await fetch("/api/bookings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              date,
              startTime,
              endTime,
              guestName: email || "",
              guestEmail: phone || "",
              contactEmail: email || "",
              notes: unifiedNotes,
              slotId,
            }),
          });
          if (!bookingRes.ok) {
            const err = await bookingRes.json().catch(() => ({}));
            throw new Error(err?.message || `Failed to create booking (${bookingRes.status})`);
          }

          setStatus("success");
          setMessage("Payment successful! Your slot is booked.");

          const now = new Date();
          setReceiptData({
            date: now.toLocaleString(),
            merchantTransactionId,
            paidBy: email || phone,
            paymentMethod: json?.data?.paymentMethod,
            items: [
              {
                description: `Remote Lab Booking (${date} ${timeSlot})`,
                quantity: 1,
                price: Number(amount),
                total: Number(amount),
              },
            ],
            amount: Number(amount),
            notes: "Thank you for your payment.",
          });
        } else {
          setStatus("failed");
          setMessage("Payment failed or was cancelled.");
        }
      } catch (e: any) {
        setStatus("failed");
        setMessage(e?.message || "Could not verify payment.");
      }
    };

    if (amount !== null) verify();
  }, [amount, merchantId, merchantTransactionId, phone, docId, email]);

  const downloadReceiptPDF = async () => {
    if (!receiptRef.current) return;

    const dataUrl = await htmlToImage.toPng(receiptRef.current, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "pt", format: "a4" });
    const imgProps = pdf.getImageProperties(dataUrl);

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pageWidth * 0.8;
    const imgHeight = (imgProps.height * imgWidth) / imgProps.width;
    const xOffset = (pageWidth - imgWidth) / 2;
    const yOffset = (pageHeight - imgHeight) / 2;

    pdf.addImage(dataUrl, "PNG", xOffset, yOffset, imgWidth, imgHeight);
      pdf.save(`receipt_${merchantTransactionId}.pdf`);
  };

  return (
    <section className="grid place-items-center py-16">
      <div className="w-full max-w-md rounded-3xl border border-[var(--foreground)]/10 bg-[var(--background)] p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div
            className={[
              "grid size-10 place-items-center rounded-2xl",
              status === "success"
                ? "bg-emerald-500/15 text-emerald-600"
                : status === "failed"
                ? "bg-rose-500/15 text-rose-600"
                : "bg-[var(--foreground)]/10",
            ].join(" ")}
          >
            {status === "success" ? (
              <svg viewBox="0 0 24 24" fill="none" className="size-5">
                <path
                  d="M5 12l4 4 10-10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : status === "failed" ? (
              <svg viewBox="0 0 24 24" fill="none" className="size-5">
                <path
                  d="M6 6l12 12M6 18L18 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" className="size-5">
                <path
                  d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </div>
          <h1 className="text-2xl font-semibold">Payment status</h1>
        </div>

        <p className="mt-3 text-[var(--foreground)]/70">{message}</p>

        {status === "failed" && missing.length > 0 && (
          <div className="mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-800">
            Missing: {missing.join(", ")}
          </div>
        )}

        <div className="mt-8 flex gap-3">
          <button
            onClick={() => location.reload()}
            className="flex-1 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-4 py-2 font-medium text-[var(--foreground)]/80 hover:bg-[var(--foreground)]/10"
          >
            Retry
          </button>
          <button
            onClick={() => router.push("/")}
            className="flex-1 rounded-2xl bg-[var(--foreground)] px-4 py-2 font-medium text-[var(--background)] hover:opacity-90"
          >
            Go Home
          </button>
        </div>

        {status === "success" && receiptData && (
          <>
            <div className="mt-6 rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-800">
              You will get an email from <b>support@hamaralabs.com</b> (please check spam, if not found in inbox) regarding the session details. Thanks for your payment!
            </div>
            <div className="mt-4 rounded-xl bg-sky-50 border border-sky-200 p-4 text-sm text-sky-800">
              To join your session, click <Link href="/login" className="font-semibold underline">Login</Link>, enter the email you used for this booking, and enjoy the experience!
            </div>
            <div className="mt-6 flex gap-3 no-print">
              <button
                onClick={downloadReceiptPDF}
                className="flex-1 rounded-2xl border border-[var(--foreground)]/15 bg-[var(--background)] px-4 py-2 font-medium text-[var(--foreground)]/90 hover:bg-[var(--foreground)]/10"
              >
                Download receipt
              </button>
            </div>
          </>
        )}
      </div>

      {status === "success" && receiptData && (
        <div className="mt-8 w-full max-w-3xl mx-auto">
          <div
            ref={receiptRef}
            className="rounded-3xl border border-slate-200 bg-white text-slate-800 shadow-lg ring-1 ring-slate-900/5"
          >
            <div className="px-6 pt-6 text-center">
              <img src="/Hamaralabs_Logo.png" alt="Logo" className="mx-auto" crossOrigin="anonymous" />
              <h1 className="mt-3 text-xl font-semibold text-slate-900">Payment Receipt</h1>
              <div className="mt-1 text-sm leading-6 text-slate-600">
                <p>SketchEA IT Consultants Pvt Ltd.</p>
                <p>#38-37-63, Bhaskar Gardens, Marripalem, Visakhapatnam</p>
                <p>Andhra Pradesh, PIN Code - 530018</p>
              </div>
            </div>

            <hr className="mx-6 mt-6 border-t border-slate-200" />

            <div className="grid grid-cols-1 gap-3 px-6 py-5 sm:grid-cols-2 text-sm">
              <p>
                <span className="font-medium text-slate-600">Date:</span>{" "}
                <span className="text-slate-900">{receiptData.date}</span>
              </p>
              <p className="sm:text-right">
                <span className="font-medium text-slate-600">Merchant Transaction Id:</span>{" "}
                <span className="font-mono text-slate-900">{receiptData.merchantTransactionId}</span>
              </p>

              {receiptData.transactionId && (
                <p>
                  <span className="font-medium text-slate-600">Transaction Id:</span>{" "}
                  <span className="font-mono text-slate-900">{receiptData.transactionId}</span>
                </p>
              )}
              <p className="sm:text-right">
                <span className="font-medium text-slate-600">Paid By:</span>{" "}
                <span className="text-slate-900">{receiptData.paidBy}</span>
              </p>

              {receiptData.paymentMethod && (
                <p className="sm:col-span-2">
                  <span className="font-medium text-slate-600">Payment Method:</span>{" "}
                  <span className="text-slate-900">{receiptData.paymentMethod}</span>
                </p>
              )}
            </div>

            <div className="px-6 pb-6">
              <h2 className="mb-2 text-lg font-medium text-slate-900">Items</h2>
              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium text-slate-700">
                      <th>Description</th>
                      <th>Quantity</th>
                      <th>Price</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {receiptData.items.map((item, index) => (
                      <tr key={index} className="[&>td]:px-3 [&>td]:py-2 text-slate-800">
                        <td>{item.description}</td>
                        <td>{item.quantity}</td>
                        <td>₹{item.price}</td>
                        <td>₹{item.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-end">
                <div className="inline-flex items-baseline gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2">
                  <span className="text-sm text-slate-600">Total Amount</span>
                  <span className="text-lg font-semibold text-slate-900">₹{receiptData.amount}</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-sm text-slate-800">
                  <span className="font-medium text-slate-600">Notes:</span>{" "}
                  {receiptData.notes || "-"}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
