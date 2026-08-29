import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const backendBase = process.env.BACKEND_SERVER || "";
  try {
  const body = await req.json();
    const headers: Record<string, string> = {
      "content-type": "application/json",
      "X-Api-Key": process.env.BACKEND_API_KEY || "",
    };
    // Forward cookies/authorization if present (useful when backend needs session)
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;
    const auth = req.headers.get("authorization");
    if (auth) headers["authorization"] = auth;

    // If merchantTransactionId is present, check if a slot already exists for idempotency
    const mtx = body?.merchantTransactionId;
    if (mtx) {
      try {
        const checkRes = await fetch(
          `${backendBase}/api/slots?merchantTransactionId=${encodeURIComponent(String(mtx))}`,
          { method: "GET", headers }
        );
        if (checkRes.ok) {
          const existing = await checkRes.json().catch(() => null);
          const hasAny = Array.isArray(existing?.slots)
            ? existing.slots.length > 0
            : Array.isArray(existing)
            ? existing.length > 0
            : !!existing?.id;
          if (hasAny) {
            // Return 409 Conflict without throwing so the client can treat it as processed
            return NextResponse.json(
              { message: "Slot already exists for this merchantTransactionId" },
              { status: 409 }
            );
          }
        }
      } catch {
        // Ignore check errors and proceed to creation
      }
    }

    const res = await fetch(`${backendBase}/api/slots`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const data = await res
      .json()
      .catch(() => ({ message: "Invalid JSON from backend" }));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Failed to create slot" },
      { status: 500 }
    );
  }
}
