import { NextResponse } from "next/server";

/**
 * Thin server-side pass-through to Libredesk's widget chat REST API.
 *
 * Libredesk's widget endpoints don't send Access-Control-Allow-Origin for arbitrary
 * origins (verified directly against the real instance — every endpoint tested, including
 * the pre-widget-load /settings call, came back with zero CORS headers regardless of the
 * inbox's "Trusted domains" setting, and the docs never mention CORS at all despite
 * describing this API as meant for custom frontends). So the browser can't call Libredesk
 * directly; it calls this same-origin proxy instead, and this route makes the real
 * server-to-server request, which has no CORS restriction at all.
 *
 * The client already holds a legitimate, short-lived Libredesk session token (issued only
 * to an authenticated user with an active booking, via /api/experience/chat-session) — this
 * route just forwards it and the inbox id header through unchanged.
 */
const LD_BASE_URL = process.env.LIBREDESK_BASE_URL || "";

async function proxy(req: Request, path: string[]) {
  const url = new URL(req.url);
  const target = `${LD_BASE_URL}/api/v1/widget/chat/${path.join("/")}${url.search}`;

  const headers: Record<string, string> = {};
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  const inboxId = req.headers.get("x-libredesk-inbox-id");
  if (inboxId) headers["X-Libredesk-Inbox-ID"] = inboxId;

  const init: RequestInit = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    const bodyText = await req.text();
    if (bodyText) {
      headers["Content-Type"] = "application/json";
      init.body = bodyText;
    }
  }

  const res = await fetch(target, init);
  const data = await res.text();
  return new NextResponse(data, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") || "application/json" },
  });
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}

export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path);
}
