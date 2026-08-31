"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type Position = { x: number; y: number };

type DragState = {
  pointerId: number | null;
  touchId: number | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

const MIN_OFFSET = 16;

/**
 * Draggable-window positioning shared by every floating panel inside the experience stage
 * (guided steps, chat). Clamps to the bounds of `boundsRef` so a window can never be
 * dragged off-stage, and re-clamps automatically on resize.
 */
export function useDraggableWindow(boundsRef: RefObject<HTMLElement | null>) {
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<Position>({ x: MIN_OFFSET, y: MIN_OFFSET });
  const [isDragging, setIsDragging] = useState(false);
  // Once the user has actually moved/resized the window, stop re-snapping it to a "default"
  // position on later layout changes (e.g. orientation rotation) — that would undo their
  // manual placement, which is worse than leaving it slightly off after a resize.
  const hasMovedRef = useRef(false);

  const clampPosition = useCallback(
    (pos: Position): Position => {
      const bounds = boundsRef.current;
      const win = windowRef.current;
      if (!bounds || !win) return pos;

      const maxX = Math.max(MIN_OFFSET, bounds.clientWidth - win.offsetWidth - MIN_OFFSET);
      const maxY = Math.max(MIN_OFFSET, bounds.clientHeight - win.offsetHeight - MIN_OFFSET);

      return {
        x: Math.min(Math.max(pos.x, MIN_OFFSET), maxX),
        y: Math.min(Math.max(pos.y, MIN_OFFSET), maxY),
      };
    },
    [boundsRef]
  );

  const startDrag = useCallback(
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
      dragRef.current = {
        pointerId,
        touchId,
        startX: clientX,
        startY: clientY,
        originX: position.x,
        originY: position.y,
      };
      hasMovedRef.current = true;
      setIsDragging(true);
    },
    [position.x, position.y]
  );

  const updateDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPosition(
        clampPosition({
          x: drag.originX + clientX - drag.startX,
          y: drag.originY + clientY - drag.startY,
        })
      );
    },
    [clampPosition]
  );

  const stopDrag = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition((current) => clampPosition(current));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button")) return;

      event.preventDefault();
      startDrag({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [startDrag]
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateDrag(event.clientX, event.clientY);
    },
    [updateDrag]
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      stopDrag();
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [stopDrag]
  );

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      if ((event.target as HTMLElement).closest("button")) return;

      const touch = event.changedTouches[0];
      if (!touch) return;

      event.preventDefault();
      startDrag({ touchId: touch.identifier, clientX: touch.clientX, clientY: touch.clientY });
    },
    [startDrag]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      const drag = dragRef.current;
      if (!drag || drag.touchId === null) return;

      const activeTouch = Array.from(event.changedTouches).find((touch) => touch.identifier === drag.touchId);
      if (!activeTouch) return;

      event.preventDefault();
      updateDrag(activeTouch.clientX, activeTouch.clientY);
    },
    [updateDrag]
  );

  const handleTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      const drag = dragRef.current;
      if (!drag || drag.touchId === null) return;

      const endedTouch = Array.from(event.changedTouches).find((touch) => touch.identifier === drag.touchId);
      if (!endedTouch) return;

      stopDrag();
    },
    [stopDrag]
  );

  return {
    windowRef,
    position,
    setPosition,
    isDragging,
    clampPosition,
    cancelDrag: stopDrag,
    hasMovedRef,
    dragHandlers: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    },
  };
}
