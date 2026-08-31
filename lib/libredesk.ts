import jwt from "jsonwebtoken";

const LD_BASE_URL = process.env.LIBREDESK_BASE_URL || "";
const LD_INBOX_UUID = process.env.LIBREDESK_INBOX_UUID || "";
const LD_INBOX_SECRET = process.env.LIBREDESK_INBOX_SECRET || "";
const LD_API_KEY = process.env.LIBREDESK_API_KEY || "";
const LD_API_SECRET = process.env.LIBREDESK_API_SECRET || "";

const GREETING = "Hi! You're through to the support team. What can we help you with?";

/**
 * Keep reusing a conversation even after an agent resolves or closes it, so a returning
 * guest lands back in the same thread instead of opening a fresh ticket. Requires
 * "allow replies to closed conversations" on the inbox.
 */
const REUSE_CLOSED = true;

/** Beyond this, a closed thread is considered stale and a new one is started. */
const REUSE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

export type Visitor = {
  externalUserId: string;
  email: string;
  firstName: string;
  lastName: string;
};

/**
 * Every visitor here is already authenticated via the app's own login (email + OTP), so —
 * unlike a typical anonymous-visitor widget setup — there's no separate cookie-based visitor
 * identity to track: the session email already is the stable identity Libredesk keys off of
 * (`external_user_id`), which is exactly what keeps a guest in the same conversation across
 * reloads and devices.
 */
export function resolveVisitor(email: string): Visitor {
  return {
    externalUserId: `user_${email}`,
    email,
    firstName: email.split("@")[0] || "there",
    lastName: "",
  };
}

// ---------------------------------------------------------------------------
// Store + lock. In-memory, single-process — fine for one server instance. Behind more than
// one instance, swap conversationCache for Redis/a table and inflight for a distributed
// lock (e.g. Redis SET NX), or two servers can create two conversations for one visitor at
// the same instant.
// ---------------------------------------------------------------------------

const conversationCache = new Map<string, string>();
const inflight = new Map<string, Promise<ChatSession>>();

export type ChatSession = { sessionToken: string; conversationUUID: string };

function withLock(key: string, fn: () => Promise<ChatSession>): Promise<ChatSession> {
  const existing = inflight.get(key);
  if (existing) return existing;
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// Libredesk calls — see https://docs.libredesk.io/api-reference/widget-api and
// https://docs.libredesk.io/api-reference/endpoint/conversations/create-conversation
// ---------------------------------------------------------------------------

function signJWT(v: Visitor): string {
  return jwt.sign(
    {
      external_user_id: v.externalUserId,
      email: v.email,
      first_name: v.firstName,
      last_name: v.lastName,
    },
    LD_INBOX_SECRET,
    { algorithm: "HS256", expiresIn: "8h" }
  );
}

async function widgetFetch(
  path: string,
  { method = "GET", token, body }: { method?: string; token?: string; body?: unknown } = {}
) {
  const res = await fetch(`${LD_BASE_URL}/api/v1/widget/chat${path}`, {
    method,
    headers: {
      "X-Libredesk-Inbox-ID": LD_INBOX_UUID,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data: json.data ?? json };
}

/** POST /api/v1/widget/chat/auth/exchange — swaps our signed JWT for a widget session token. */
async function exchangeToken(v: Visitor): Promise<string> {
  const r = await widgetFetch("/auth/exchange", { method: "POST", body: { jwt: signJWT(v) } });
  if (!r.ok) throw new Error(`exchange failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.session_token;
}

function usable(convo: any): boolean {
  if (!convo) return false;
  const status = String(convo.status || "").toLowerCase();
  const closed = status === "closed" || status === "resolved" || Boolean(convo.closed_at);
  if (closed && !REUSE_CLOSED) return false;
  const created = convo.created_at ? new Date(convo.created_at).getTime() : Date.now();
  if (closed && Date.now() - created > REUSE_MAX_AGE_MS) return false;
  return true;
}

/** GET /api/v1/widget/chat/conversations/{uuid} */
async function fetchConversation(uuid: string, token: string) {
  const r = await widgetFetch(`/conversations/${uuid}`, { token });
  if (!r.ok) return null;
  return r.data.conversation ?? r.data;
}

/** GET /api/v1/widget/chat/conversations — conversations visible to this widget session. */
async function listConversations(token: string): Promise<any[]> {
  const r = await widgetFetch("/conversations", { token });
  if (!r.ok) return [];
  const data = r.data;
  return Array.isArray(data) ? data : (data.conversations ?? []);
}

function sortByRecency(list: any[]) {
  return [...list].sort(
    (a, b) =>
      new Date(b.last_message_at || b.created_at || 0).getTime() -
      new Date(a.last_message_at || a.created_at || 0).getTime()
  );
}

/**
 * POST /api/v1/widget/chat/conversations/init — the widget-scoped creation endpoint. This is
 * the ONLY way to create a conversation on a "livechat"-channel inbox: the generic admin
 * POST /api/v1/conversations rejects every payload on this inbox with a bare 400
 * InputException regardless of fields (verified directly against the real instance) — a
 * livechat conversation apparently has to originate through the widget flow.
 *
 * Its `message` is required and non-empty, and gets attributed to the *contact*, not an
 * agent — there's no way to create the conversation with zero visitor-attributed text. So this
 * uses a neutral, honest system-style line (never a fabricated customer question) for that
 * required first message, and the real "introductory message" greeting is injected right
 * after as a genuine agent message via sendAgentGreeting.
 */
async function initConversation(token: string): Promise<string> {
  const r = await widgetFetch("/conversations/init", {
    method: "POST",
    token,
    body: { message: "Opened the in-experience support chat." },
  });
  if (!r.ok) throw new Error(`init failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.conversation.uuid;
}

/**
 * POST /api/v1/conversations/{uuid}/messages — the admin/agent API, authenticated with the
 * inbox's API key/secret (never exposed to the browser). Adding a message to an
 * already-existing conversation works here even though creating one this way doesn't; this is
 * what actually delivers the automatic introductory greeting from support.
 */
async function sendAgentGreeting(uuid: string): Promise<void> {
  const authHeader = "Basic " + Buffer.from(`${LD_API_KEY}:${LD_API_SECRET}`).toString("base64");
  const res = await fetch(`${LD_BASE_URL}/api/v1/conversations/${uuid}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: authHeader },
    body: JSON.stringify({ sender_type: "agent", message: GREETING }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`greeting failed: ${res.status} ${body}`);
  }
}

async function resolveSession(v: Visitor): Promise<ChatSession> {
  const token = await exchangeToken(v);

  const cached = conversationCache.get(v.externalUserId);
  if (cached) {
    const convo = await fetchConversation(cached, token);
    if (usable(convo)) return { sessionToken: token, conversationUUID: cached };
    conversationCache.delete(v.externalUserId);
  }

  const existing = sortByRecency(await listConversations(token)).find(usable);
  if (existing) {
    conversationCache.set(v.externalUserId, existing.uuid);
    return { sessionToken: token, conversationUUID: existing.uuid };
  }

  const uuid = await initConversation(token);
  conversationCache.set(v.externalUserId, uuid);
  await sendAgentGreeting(uuid).catch((err) => console.error("[libredesk] failed to send greeting:", err));
  return { sessionToken: token, conversationUUID: uuid };
}

export async function getChatSession(
  v: Visitor
): Promise<ChatSession & { baseURL: string; inboxID: string }> {
  const { sessionToken, conversationUUID } = await withLock(v.externalUserId, () => resolveSession(v));
  return { sessionToken, conversationUUID, baseURL: LD_BASE_URL, inboxID: LD_INBOX_UUID };
}
