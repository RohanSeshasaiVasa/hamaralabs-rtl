import crypto from "crypto";

function cwBaseUrl(): string {
  return `${process.env.CHATWOOT_URL}/api/v1/accounts/${process.env.CW_ACCOUNT_ID}`;
}

async function cw(path: string, options: RequestInit = {}) {
  const res = await fetch(`${cwBaseUrl()}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      api_access_token: process.env.CW_API_TOKEN || "",
    },
  });
  if (!res.ok) {
    throw new Error(`Chatwoot ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const greeting = (name: string) => `Hi ${name}! I'm here with you for the next hour — ask me anything.`;

export const hashIdentifier = (identifier: string) =>
  crypto.createHmac("sha256", process.env.CHATWOOT_HMAC_SECRET || "").update(identifier).digest("hex");

type ConversationInput = { email: string; name: string; bookingId: string; sourceId: string };

// Chatwoot's contact/conversation lookup is read-then-write with no lock, so concurrent calls
// for the same booking+widget session (e.g. React Strict Mode double-invoking an effect) could
// both find "no existing conversation" and both try to create one. Dedupe concurrent calls so
// only one actually runs at a time.
const inflight = new Map<string, Promise<any>>();

export function ensureChatwootConversation(input: ConversationInput): Promise<any> {
  const key = `${input.email}:${input.bookingId}:${input.sourceId}`;
  if (!inflight.has(key)) {
    inflight.set(
      key,
      run(input).finally(() => inflight.delete(key))
    );
  }
  return inflight.get(key)!;
}

async function run(input: ConversationInput) {
  const contacts = await cw(`/contacts/search?q=${encodeURIComponent(input.email)}`);
  const contact = contacts.payload?.find(
    (c: any) => c.identifier === input.email || c.email?.toLowerCase() === input.email.toLowerCase()
  );

  if (contact) {
    const convos = await cw(`/contacts/${contact.id}/conversations`);
    const existing = convos.payload?.find(
      (c: any) => String(c.custom_attributes?.booking_id) === String(input.bookingId)
    );
    if (existing) return existing;
  }

  // source_id alone, no inbox_id/contact_id: that puts the conversation on the widget's OWN
  // contact_inbox (the one setUser already linked and the widget is actively reading from) —
  // sending inbox_id/contact_id too makes Chatwoot find_or_create_by those plus source_id, which
  // 422s with a duplicate-source_id error once the contact has already merged into this inbox.
  return cw("/conversations", {
    method: "POST",
    body: JSON.stringify({
      source_id: input.sourceId,
      custom_attributes: { booking_id: input.bookingId },
      message: { content: greeting(input.name), message_type: "outgoing" },
    }),
  });
}
