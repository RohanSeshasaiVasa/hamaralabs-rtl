"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useDraggableWindow } from "./use-draggable-window";

type ChatMessage = {
  id: string;
  html: string;
  mine: boolean;
  at: Date;
  conversation?: string;
};

const PING_INTERVAL_MS = 30_000;
const TYPING_TIMEOUT_MS = 2_000;
const WINDOW_OFFSET = 24;

function normalizeMessage(raw: any, conversationUUID: string): ChatMessage {
  const sender = raw.sender_type || raw.type || raw.sender || "";
  return {
    id: raw.uuid || raw.id || `${raw.created_at}-${Math.random()}`,
    html: raw.content ?? raw.message ?? "",
    mine: /contact|visitor/i.test(sender) && !/agent/i.test(sender),
    at: raw.created_at ? new Date(raw.created_at) : new Date(),
    conversation: raw.conversation_uuid || conversationUUID,
  };
}

export default function ChatWindow({
  stageRef,
  bookingId,
}: {
  stageRef: RefObject<HTMLDivElement | null>;
  bookingId: string;
}) {
  const { windowRef, position, setPosition, isDragging, clampPosition, dragHandlers } =
    useDraggableWindow(stageRef);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const [isTyping, setIsTyping] = useState(false);
  const [input, setInput] = useState("");
  const [isReady, setIsReady] = useState(false);

  const sessionTokenRef = useRef<string | null>(null);
  const conversationUUIDRef = useRef<string | null>(null);
  const baseURLRef = useRef<string | null>(null);
  const inboxIDRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const reconnectDelayRef = useRef(1000);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const appendMessage = useCallback((raw: any) => {
    const conversationUUID = conversationUUIDRef.current;
    if (!conversationUUID) return;
    const m = normalizeMessage(raw, conversationUUID);
    if (m.conversation && m.conversation !== conversationUUID) return;
    if (seenIdsRef.current.has(m.id)) return;
    seenIdsRef.current.add(m.id);
    setMessages((current) => [...current, m]);
  }, []);

  const headers = useCallback((extra: Record<string, string> = {}) => {
    const h: Record<string, string> = { "X-Libredesk-Inbox-ID": inboxIDRef.current || "", ...extra };
    if (sessionTokenRef.current) h.Authorization = `Bearer ${sessionTokenRef.current}`;
    return h;
  }, []);

  // Routed through our own /api/experience/chat-proxy rather than baseURLRef.current directly —
  // Libredesk's widget REST API doesn't send Access-Control-Allow-Origin, so the browser can't
  // call it cross-origin at all; the proxy makes the actual request server-to-server instead.
  const api = useCallback(
    async (path: string, { method = "GET", body }: { method?: string; body?: unknown } = {}) => {
      const res = await fetch(`/api/experience/chat-proxy${path}`, {
        method,
        headers: headers(body ? { "Content-Type": "application/json" } : {}),
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`${path} failed: ${res.status} ${JSON.stringify(json)}`);
      return json.data ?? json;
    },
    [headers]
  );

  const markSeen = useCallback(() => {
    const conversationUUID = conversationUUIDRef.current;
    if (!conversationUUID || !sessionTokenRef.current) return;
    api(`/conversations/${conversationUUID}/update-last-seen`, { method: "POST" }).catch(() => {});
  }, [api]);

  const sendTyping = useCallback((typing: boolean) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({ type: "typing", data: { conversation_uuid: conversationUUIDRef.current, is_typing: typing } })
    );
  }, []);

  const connectSocket = useCallback(() => {
    const baseURL = baseURLRef.current;
    if (!baseURL) return;
    const wsURL = baseURL.replace(/^http/, "ws") + "/widget/ws";
    const ws = new WebSocket(wsURL);
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectDelayRef.current = 1000;
      ws.send(JSON.stringify({ type: "join", token: sessionTokenRef.current, data: { inbox_id: inboxIDRef.current } }));
      ws.send(JSON.stringify({ type: "page_visit", data: { url: window.location.href, title: document.title } }));
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify({ type: "ping" }));
      }, PING_INTERVAL_MS);
    };

    ws.onmessage = (event) => {
      let msg: any;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      switch (msg.type) {
        case "new_message":
          appendMessage(msg.data);
          markSeen();
          break;
        case "typing":
          if (msg.data?.conversation_uuid === conversationUUIDRef.current) {
            setIsTyping(Boolean(msg.data.is_typing));
          }
          break;
        case "error":
          console.warn("[libredesk] socket error", msg.data);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      reconnectTimeoutRef.current = setTimeout(connectSocket, reconnectDelayRef.current);
      reconnectDelayRef.current = Math.min(reconnectDelayRef.current * 2, 30000);
    };
  }, [appendMessage, markSeen]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const qs = new URLSearchParams({ bookingId });
        const res = await fetch(`/api/experience/chat-session?${qs.toString()}`, { cache: "no-store" });
        const session = await res.json();
        if (cancelled) return;

        if (!res.ok || session.status !== "active") {
          setStatus("Chat is unavailable right now.");
          return;
        }

        baseURLRef.current = session.baseURL;
        inboxIDRef.current = session.inboxID;
        sessionTokenRef.current = session.sessionToken;
        conversationUUIDRef.current = session.conversationUUID;

        const convo = await api(`/conversations/${session.conversationUUID}`);
        if (cancelled) return;
        const history = convo.messages ?? convo.conversation?.messages ?? [];
        history.forEach((m: any) => appendMessage(m));
        markSeen();

        connectSocket();
        setIsReady(true);
        setStatus("");
      } catch (err) {
        console.error("[libredesk]", err);
        if (!cancelled) setStatus("Chat is unavailable right now.");
      }
    };

    start();

    return () => {
      cancelled = true;
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const handleFocus = () => markSeen();
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [markSeen]);

  // Default position: bottom-left, so it doesn't start out overlapping the guided-steps
  // window (which defaults to top-right).
  useEffect(() => {
    const stage = stageRef.current;
    const win = windowRef.current;
    const defaultPosition =
      stage && win
        ? { x: WINDOW_OFFSET, y: stage.clientHeight - win.offsetHeight - WINDOW_OFFSET }
        : { x: WINDOW_OFFSET, y: WINDOW_OFFSET };
    const frameId = requestAnimationFrame(() => {
      setPosition(clampPosition(defaultPosition));
    });
    return () => cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setPosition((current) => clampPosition(current));
    });
    return () => cancelAnimationFrame(frameId);
  }, [clampPosition, isCollapsed]);

  const handleInputChange = (value: string) => {
    setInput(value);
    sendTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => sendTyping(false), TYPING_TIMEOUT_MS);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || !conversationUUIDRef.current) return;
    setInput("");
    sendTyping(false);
    try {
      await api(`/conversations/${conversationUUIDRef.current}/message`, { method: "POST", body: { message: text } });
    } catch (err) {
      console.error("[libredesk]", err);
      setStatus("Message not sent. Try again.");
    }
  };

  return (
    <div
      ref={windowRef}
      className={
        "absolute z-10 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-white/15 bg-black/80 text-white shadow-2xl backdrop-blur " +
        (isDragging ? "cursor-grabbing select-none" : "")
      }
      style={{ left: `${position.x}px`, top: `${position.y}px`, maxHeight: "70vh" }}
    >
      <div className="flex cursor-grab items-center justify-between gap-3 border-b border-white/10 p-3" {...dragHandlers}>
        <div>
          <strong className="block text-sm">Chat with support</strong>
          <span className="text-xs text-white/50">Drag this window anywhere over the feed.</span>
        </div>
        <button
          type="button"
          onClick={() => setIsCollapsed((prev) => !prev)}
          className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
        >
          {isCollapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!isCollapsed && (
        <>
          <div ref={logRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3" style={{ maxHeight: "45vh" }}>
            {messages.map((m) => (
              <div
                key={m.id}
                className={"flex max-w-[85%] flex-col " + (m.mine ? "self-end items-end" : "self-start items-start")}
              >
                <div
                  className={"rounded-2xl px-3 py-2 text-sm " + (m.mine ? "bg-white text-black" : "bg-white/10 text-white")}
                  dangerouslySetInnerHTML={{ __html: m.html }}
                />
                <time className="mt-1 text-[10px] text-white/40">
                  {m.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </time>
              </div>
            ))}
          </div>

          {isTyping && <div className="px-3 pb-1 text-xs text-white/50">Agent is typing…</div>}
          {status && <div className="px-3 pb-2 text-xs text-amber-300">{status}</div>}

          <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-white/10 p-3">
            <textarea
              rows={1}
              value={input}
              disabled={!isReady}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(e as unknown as React.FormEvent);
                }
              }}
              placeholder="Write a message"
              className="max-h-28 flex-1 resize-none rounded-xl border border-white/15 bg-black/40 px-3 py-2 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/30 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!isReady || !input.trim()}
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
            >
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}
