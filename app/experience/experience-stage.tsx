"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as LivekitClient from "livekit-client";

const EXPERIMENT = {
  id: "know-voltage",
  title: "Know the voltage of household electric supply",
  description: "Measure the voltage of a home power outlet using the remote multimeter setup.",
};

const actionSteps: Array<{
  id: string;
  label: string;
  id_2?: string;
  hold_final_position?: boolean;
}> = [
  {
    id: "exp-check-voltage/plug-in",
    label: "Insert the leads into the socket.",
    id_2: "exp-check-voltage-camera/plug-in",
    hold_final_position: true,
  },
  { id: "exp-check-voltage/dial-multimeter", label: "Dial the multimeter." },
  { id: "exp-check-voltage/switch-on", label: "Switch on the power supply." },
  {
    id: "null",
    label: "See the reading on the multimeter.",
    id_2: "exp-check-voltage-camera/read-multimeter-values",
    hold_final_position: true,
  },
  { id: "exp-check-voltage/switch-off", label: "Switch off the power supply." },
  { id: "exp-check-voltage/dial-back-multimeter", label: "Dial back the multimeter." },
  { id: "exp-check-voltage/unplug", label: "Take the leads off the socket." },
];

const LIVEKIT_SERVER_URL = "wss://livestream.hamaralabs.com";
const LIVEKIT_TOKEN_ENDPOINT = "https://livestream.hamaralabs.com/token?identity=viewer";

const STEPS_WINDOW_DEFAULT_OFFSET = 24;

type Notification = { id: string; message: string; type: "success" | "error" };
type Position = { x: number; y: number };
type DragState = {
  pointerId: number | null;
  touchId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const COMPLETION_POLL_INTERVAL_MS = 10_000;

export default function ExperienceStage({ bookingId }: { bookingId: string }) {
  const router = useRouter();

  const [runningStepId, setRunningStepId] = useState<string | null>(null);
  const [isStepsWindowCollapsed, setIsStepsWindowCollapsed] = useState(false);
  const [isDraggingStepsWindow, setIsDraggingStepsWindow] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [stepsWindowPosition, setStepsWindowPosition] = useState<Position>({
    x: STEPS_WINDOW_DEFAULT_OFFSET,
    y: 104,
  });
  const [isFeedReady, setIsFeedReady] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<LivekitClient.Room | null>(null);
  const videoTrackRef = useRef<LivekitClient.RemoteTrack | null>(null);
  const experimentStageRef = useRef<HTMLDivElement>(null);
  const stepsWindowRef = useRef<HTMLDivElement>(null);
  const stepsWindowDragRef = useRef<DragState | null>(null);
  const notificationTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    document.title = "Remote Labs | Hamaralabs";
  }, []);

  const dismissNotification = useCallback((notificationId: string) => {
    const timeoutId = notificationTimeoutsRef.current[notificationId];
    if (timeoutId) {
      clearTimeout(timeoutId);
      delete notificationTimeoutsRef.current[notificationId];
    }
    setNotifications((current) => current.filter((n) => n.id !== notificationId));
  }, []);

  const showNotification = useCallback(
    (message: string, type: "success" | "error" = "success") => {
      const notificationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setNotifications((current) => [...current.slice(-2), { id: notificationId, message, type }]);
      notificationTimeoutsRef.current[notificationId] = setTimeout(() => {
        dismissNotification(notificationId);
      }, 4200);
    },
    [dismissNotification]
  );

  useEffect(() => {
    return () => {
      Object.values(notificationTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      notificationTimeoutsRef.current = {};
    };
  }, []);

  const clampStepsWindowPosition = useCallback((position: Position): Position => {
    const stage = experimentStageRef.current;
    const stepsWindow = stepsWindowRef.current;
    if (!stage || !stepsWindow) return position;

    const minOffset = 16;
    const maxX = Math.max(minOffset, stage.clientWidth - stepsWindow.offsetWidth - minOffset);
    const maxY = Math.max(minOffset, stage.clientHeight - stepsWindow.offsetHeight - minOffset);

    return {
      x: Math.min(Math.max(position.x, minOffset), maxX),
      y: Math.min(Math.max(position.y, minOffset), maxY),
    };
  }, []);

  const getDefaultStepsWindowPosition = useCallback((): Position => {
    const stage = experimentStageRef.current;
    const stepsWindow = stepsWindowRef.current;
    if (!stage || !stepsWindow) {
      return { x: STEPS_WINDOW_DEFAULT_OFFSET, y: 104 };
    }
    return clampStepsWindowPosition({
      x: stage.clientWidth - stepsWindow.offsetWidth - STEPS_WINDOW_DEFAULT_OFFSET,
      y: 104,
    });
  }, [clampStepsWindowPosition]);

  const unlockLandscapeOrientation = useCallback(() => {
    try {
      (window.screen.orientation as any)?.unlock?.();
    } catch {
      // ignore
    }
  }, []);

  const lockLandscapeOrientation = useCallback(async () => {
    try {
      await (window.screen.orientation as any)?.lock?.("landscape");
    } catch {
      // best effort only — not all browsers/contexts allow this
    }
  }, []);

  const requestStageFullscreen = useCallback(async () => {
    const stage = experimentStageRef.current as any;
    if (!stage) return false;

    const requestFullscreen =
      stage.requestFullscreen || stage.webkitRequestFullscreen || stage.mozRequestFullScreen || stage.msRequestFullscreen;
    if (!requestFullscreen) return false;

    try {
      await requestFullscreen.call(stage);
      return true;
    } catch {
      return false;
    }
  }, []);

  const exitStageFullscreen = useCallback(async () => {
    const doc = document as any;
    const exitFullscreen = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
    if (!exitFullscreen) return;
    try {
      await exitFullscreen.call(document);
    } catch {
      // ignore
    }
  }, []);

  const leaveExperience = useCallback(() => {
    router.push("/my-bookings");
  }, [router]);

  // Poll for the booking being marked completed while the experience is open (e.g. an admin
  // ends the session early) and kick the guest out the moment it happens.
  useEffect(() => {
    let cancelled = false;

    const checkCompleted = async () => {
      try {
        const res = await fetch(`/api/experience/status?bookingId=${encodeURIComponent(bookingId)}`, {
          cache: "no-store",
        });
        if (!res.ok || cancelled) return;
        const { completed } = await res.json();
        if (completed && !cancelled) {
          cancelled = true;
          clearInterval(intervalId);
          leaveExperience();
          alert("Experience over!");
        }
      } catch {
        // ignore transient network errors and retry on the next tick
      }
    };

    const intervalId = setInterval(checkCompleted, COMPLETION_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [bookingId, leaveExperience]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const doc = document as any;
      const fullscreenElement =
        doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

      if (!fullscreenElement) {
        unlockLandscapeOrientation();
        leaveExperience();
      }
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [leaveExperience, unlockLandscapeOrientation]);

  useEffect(() => {
    requestStageFullscreen().then((isFullscreenActive) => {
      if (isFullscreenActive) {
        lockLandscapeOrientation();
      }
    });
  }, [lockLandscapeOrientation, requestStageFullscreen]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setStepsWindowPosition(getDefaultStepsWindowPosition());
    });
    return () => cancelAnimationFrame(frameId);
  }, [getDefaultStepsWindowPosition]);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      setStepsWindowPosition((current) => clampStepsWindowPosition(current));
    });
    return () => cancelAnimationFrame(frameId);
  }, [clampStepsWindowPosition, isStepsWindowCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      setStepsWindowPosition((current) => clampStepsWindowPosition(current));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampStepsWindowPosition]);

  useEffect(() => {
    const mql = window.matchMedia("(orientation: portrait)");
    const update = () => setIsPortrait(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  const detachVideoTrack = useCallback(() => {
    if (videoTrackRef.current) {
      videoTrackRef.current.detach();
      videoTrackRef.current = null;
    }
    setIsFeedReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const attachVideoTrack = useCallback((track: LivekitClient.RemoteTrack) => {
    if (!videoRef.current || track.kind !== LivekitClient.Track.Kind.Video) return;
    videoTrackRef.current = track;
    track.attach(videoRef.current);
    setIsFeedReady(true);
    videoRef.current.play().catch(() => {});
  }, []);

  const subscribeToParticipantTracks = useCallback(
    (participant: LivekitClient.RemoteParticipant) => {
      participant.trackPublications.forEach((publication) => {
        if (publication.isSubscribed && publication.track && publication.track.kind === LivekitClient.Track.Kind.Video) {
          attachVideoTrack(publication.track);
        }
      });
    },
    [attachVideoTrack]
  );

  const teardownRoom = useCallback(async () => {
    detachVideoTrack();
    if (roomRef.current) {
      try {
        await roomRef.current.disconnect();
      } catch {
        // ignore
      }
      roomRef.current = null;
    }
  }, [detachVideoTrack]);

  const startStream = useCallback(async () => {
    await teardownRoom();
    setIsFeedReady(false);

    try {
      const tokenResponse = await fetch(`${LIVEKIT_TOKEN_ENDPOINT}${Math.random()}`);
      if (!tokenResponse.ok) throw new Error("Unable to fetch LiveKit token");
      const token = await tokenResponse.text();

      const room = new LivekitClient.Room({ adaptiveStream: true, dynacast: true });
      roomRef.current = room;

      room.on(LivekitClient.RoomEvent.TrackSubscribed, (track) => attachVideoTrack(track));
      room.on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => subscribeToParticipantTracks(participant));
      room.on(LivekitClient.RoomEvent.TrackUnsubscribed, (track) => {
        if (track === videoTrackRef.current) detachVideoTrack();
      });
      room.on(LivekitClient.RoomEvent.Disconnected, () => detachVideoTrack());

      await room.connect(LIVEKIT_SERVER_URL, token);
      room.remoteParticipants.forEach((participant) => subscribeToParticipantTracks(participant));
    } catch (error) {
      console.error(error);
      showNotification("Unable to start the live feed. Please try again.", "error");
      await teardownRoom();
    }
  }, [attachVideoTrack, detachVideoTrack, showNotification, subscribeToParticipantTracks, teardownRoom]);

  useEffect(() => {
    startStream();
    return () => {
      teardownRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      teardownRoom();
      unlockLandscapeOrientation();
    };
  }, [teardownRoom, unlockLandscapeOrientation]);

  const handleExitExperiment = useCallback(async () => {
    stepsWindowDragRef.current = null;
    setIsDraggingStepsWindow(false);
    unlockLandscapeOrientation();
    await exitStageFullscreen();
    leaveExperience();
  }, [exitStageFullscreen, leaveExperience, unlockLandscapeOrientation]);

  const startStepsWindowDrag = useCallback(
    ({
      pointerId = null,
      touchId = null,
      clientX,
      clientY,
    }: {
      pointerId?: number | null;
      touchId?: number | null;
      clientX: number;
      clientY: number;
    }) => {
      stepsWindowDragRef.current = {
        pointerId,
        touchId,
        startX: clientX,
        startY: clientY,
        originX: stepsWindowPosition.x,
        originY: stepsWindowPosition.y,
      };
      setIsDraggingStepsWindow(true);
    },
    [stepsWindowPosition.x, stepsWindowPosition.y]
  );

  const updateStepsWindowDrag = useCallback(
    (clientX: number, clientY: number) => {
      const dragState = stepsWindowDragRef.current;
      if (!dragState) return;
      setStepsWindowPosition(
        clampStepsWindowPosition({
          x: dragState.originX + clientX - dragState.startX,
          y: dragState.originY + clientY - dragState.startY,
        })
      );
    },
    [clampStepsWindowPosition]
  );

  const stopStepsWindowDrag = useCallback(() => {
    stepsWindowDragRef.current = null;
    setIsDraggingStepsWindow(false);
  }, []);

  const handleStepsWindowPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button")) return;

      event.preventDefault();
      startStepsWindowDrag({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [startStepsWindowDrag]
  );

  const handleStepsWindowPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = stepsWindowDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateStepsWindowDrag(event.clientX, event.clientY);
    },
    [updateStepsWindowDrag]
  );

  const handleStepsWindowPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = stepsWindowDragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      stopStepsWindowDrag();
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [stopStepsWindowDrag]
  );

  const handleStepsWindowTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      if ((event.target as HTMLElement).closest("button")) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      event.preventDefault();
      startStepsWindowDrag({ touchId: touch.identifier, clientX: touch.clientX, clientY: touch.clientY });
    },
    [startStepsWindowDrag]
  );

  const handleStepsWindowTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      const dragState = stepsWindowDragRef.current;
      if (!dragState || dragState.touchId === null) return;

      const activeTouch = Array.from(event.changedTouches).find((touch) => touch.identifier === dragState.touchId);
      if (!activeTouch) return;

      event.preventDefault();
      updateStepsWindowDrag(activeTouch.clientX, activeTouch.clientY);
    },
    [updateStepsWindowDrag]
  );

  const handleStepsWindowTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      const dragState = stepsWindowDragRef.current;
      if (!dragState || dragState.touchId === null) return;

      const endedTouch = Array.from(event.changedTouches).find((touch) => touch.identifier === dragState.touchId);
      if (!endedTouch) return;

      stopStepsWindowDrag();
    },
    [stopStepsWindowDrag]
  );

  async function handleActionTrigger(repoId: string, id_2?: string, holdFinalPosition?: boolean) {
    if (!repoId || runningStepId || repoId === "null") return;

    try {
      setRunningStepId(repoId);
      const payload: Record<string, unknown> = { repo_id: repoId };
      if (id_2) {
        payload.simultaneously = true;
        payload.second_repo_id = id_2;
      }
      if (holdFinalPosition) {
        payload.hold_final_position = true;
      }

      const response = await fetch("https://remote-labs.hamaralabs.com/replay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Action trigger failed");

      showNotification("Action triggered successfully.", "success");
    } catch (error) {
      console.error(error);
      showNotification("Unable to trigger the action. Please try again.", "error");
    } finally {
      setRunningStepId(null);
    }
  }

  const formatIndex = (index: number) => (index + 1).toString().padStart(2, "0");

  return (
    <div
      ref={experimentStageRef}
      className="fixed inset-0 z-[100] overflow-hidden bg-black"
      aria-label={`${EXPERIMENT.title} experiment mode`}
    >
      <div className="absolute inset-0 z-0">
        {/*
          The mask below is a required workaround, not decoration: Safari promotes an
          actively-decoding <video> to its own hardware compositing layer that bypasses the
          page's normal stacking entirely, drawing on top of everything else regardless of
          z-index — it only appears once real frames are decoding, so it's invisible with a
          paused/black video. The mask must be on the <video> element itself (not a wrapper)
          to force it back into normal layer compositing so the UI overlays below (top bar,
          steps window, notifications) can actually appear above it.
        */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-contain"
          style={{ WebkitMaskImage: "-webkit-radial-gradient(white, black)" }}
        />
        {!isFeedReady && (
          <div className="absolute inset-0 grid place-items-center gap-3 bg-black text-white">
            <div className="size-10 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            <p className="text-sm font-medium text-white/80">Loading live feed…</p>
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/40" />
      </div>

      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-4 p-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-white/50">Live experiment</p>
          <h2 className="text-lg font-semibold text-white">{EXPERIMENT.title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startStream}
            className="rounded-xl bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur transition hover:bg-white/20"
          >
            Refresh feed
          </button>
          <button
            type="button"
            onClick={handleExitExperiment}
            className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-900/40 transition hover:bg-red-500 active:bg-red-700"
          >
            Exit
          </button>
        </div>
      </div>

      {notifications.length > 0 && (
        <div className="absolute right-4 top-20 z-20 flex w-72 flex-col gap-2" aria-live="polite" aria-atomic="true">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              className={
                "flex items-start justify-between gap-3 rounded-2xl border p-3 text-sm shadow-lg backdrop-blur " +
                (notification.type === "error"
                  ? "border-red-400/30 bg-red-950/80 text-red-100"
                  : "border-emerald-400/30 bg-emerald-950/80 text-emerald-100")
              }
            >
              <div>
                <strong className="block text-xs uppercase tracking-wide opacity-70">
                  {notification.type === "error" ? "Error" : "Success"}
                </strong>
                <span>{notification.message}</span>
              </div>
              <button
                type="button"
                onClick={() => dismissNotification(notification.id)}
                className="shrink-0 text-xs font-medium opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        ref={stepsWindowRef}
        className={
          "absolute z-10 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/15 bg-black/80 text-white shadow-2xl backdrop-blur " +
          (isDraggingStepsWindow ? "cursor-grabbing select-none" : "")
        }
        style={{ left: `${stepsWindowPosition.x}px`, top: `${stepsWindowPosition.y}px` }}
      >
        <div
          className="flex cursor-grab items-center justify-between gap-3 border-b border-white/10 p-3"
          onPointerDown={handleStepsWindowPointerDown}
          onPointerMove={handleStepsWindowPointerMove}
          onPointerUp={handleStepsWindowPointerUp}
          onPointerCancel={handleStepsWindowPointerUp}
          onTouchStart={handleStepsWindowTouchStart}
          onTouchMove={handleStepsWindowTouchMove}
          onTouchEnd={handleStepsWindowTouchEnd}
          onTouchCancel={handleStepsWindowTouchEnd}
          aria-grabbed={isDraggingStepsWindow}
        >
          <div>
            <strong className="block text-sm">Guided steps</strong>
            <span className="text-xs text-white/50">Drag this window anywhere over the feed.</span>
          </div>
          <button
            type="button"
            onClick={() => setIsStepsWindowCollapsed((prev) => !prev)}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/10"
          >
            {isStepsWindowCollapsed ? "Expand" : "Collapse"}
          </button>
        </div>

        {!isStepsWindowCollapsed && (
          <div className="max-h-[60vh] overflow-y-auto p-3">
            <ol className="space-y-2">
              {actionSteps.map((step, index) => {
                const isRunning = runningStepId === step.id;
                return (
                  <li
                    key={step.label}
                    className={
                      "flex items-center gap-3 rounded-xl border p-3 text-sm " +
                      (isRunning ? "border-white/30 bg-white/10" : "border-white/10")
                    }
                  >
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold">
                      {formatIndex(index)}
                    </span>
                    <p className="flex-1">{step.label}</p>
                    {step.id !== "null" ? (
                      <button
                        type="button"
                        disabled={Boolean(runningStepId)}
                        onClick={() => handleActionTrigger(step.id, step.id_2, step.hold_final_position)}
                        className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:opacity-90 disabled:opacity-40"
                      >
                        {isRunning ? "Running…" : "Run step"}
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs text-white/50">Observe</span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </div>

      {isPortrait && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/95 px-6 text-center">
          <div>
            <p className="text-sm uppercase tracking-wide text-white/50">Landscape only</p>
            <h2 className="mt-2 text-xl font-semibold text-white">Rotate your device</h2>
            <p className="mt-2 text-sm text-white/70">
              The experiment view is designed for landscape so the live feed and guided steps stay visible together.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
