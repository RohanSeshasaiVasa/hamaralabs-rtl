import { NextResponse } from "next/server";

/**
 * Same reasoning as chat-proxy: Libredesk's widget API doesn't send Access-Control-Allow-Origin,
 * so the browser can't POST the multipart upload cross-origin either. This streams the raw
 * request body straight through (no re-parsing of the multipart form) — the original
 * content-type header carries the boundary Libredesk needs to parse it.
 */
const LD_BASE_URL = process.env.LIBREDESK_BASE_URL || "";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const inboxId = req.headers.get("x-libredesk-inbox-id");
  const contentType = req.headers.get("content-type");

  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  if (inboxId) headers["X-Libredesk-Inbox-ID"] = inboxId;
  if (contentType) headers["content-type"] = contentType;

  const res = await fetch(`${LD_BASE_URL}/api/v1/widget/media/upload`, {
    method: "POST",
    headers,
    body: req.body,
    // @ts-expect-error -- Node's fetch requires this when streaming a request body
    duplex: "half",
  });

  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}
