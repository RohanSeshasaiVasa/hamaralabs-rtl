import { useCallback, useEffect, useRef, useState } from "react";

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
 * Shared drag/position logic for the floating windows inside the experience stage (guided
 * steps, chat). Positions itself relative to `stageRef` and re-clamps on resize so the window
 * never drifts off-screen.
 */
export function useDraggableWindow(
  stageRef: React.RefObject<HTMLElement | null>,
  computeDefaultPosition: (stage: HTMLElement, win: HTMLElement) => Position
) {
  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [position, setPosition] = useState<Position>({ x: MIN_OFFSET, y: MIN_OFFSET });
  const [isDragging, setIsDragging] = useState(false);

  const clampPosition = useCallback(
    (pos: Position): Position => {
      const stage = stageRef.current;
      const win = windowRef.current;
      if (!stage || !win) return pos;

      const maxX = Math.max(MIN_OFFSET, stage.clientWidth - win.offsetWidth - MIN_OFFSET);
      const maxY = Math.max(MIN_OFFSET, stage.clientHeight - win.offsetHeight - MIN_OFFSET);

      return {
        x: Math.min(Math.max(pos.x, MIN_OFFSET), maxX),
        y: Math.min(Math.max(pos.y, MIN_OFFSET), maxY),
      };
    },
    [stageRef]
  );

  const resetToDefault = useCallback(() => {
    const stage = stageRef.current;
    const win = windowRef.current;
    if (!stage || !win) return;
    setPosition(clampPosition(computeDefaultPosition(stage, win)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampPosition, stageRef]);

  useEffect(() => {
    const frameId = requestAnimationFrame(resetToDefault);
    return () => cancelAnimationFrame(frameId);
  }, [resetToDefault]);

  useEffect(() => {
    const handleResize = () => setPosition((current) => clampPosition(current));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPosition]);

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
      setIsDragging(true);
    },
    [position.x, position.y]
  );

  const updateDrag = useCallback(
    (clientX: number, clientY: number) => {
      const dragState = dragRef.current;
      if (!dragState) return;
      setPosition(
        clampPosition({
          x: dragState.originX + clientX - dragState.startX,
          y: dragState.originY + clientY - dragState.startY,
        })
      );
    },
    [clampPosition]
  );

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setIsDragging(false);
  }, []);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if ((event.target as HTMLElement).closest("button")) return;

      event.preventDefault();
      startDrag({ pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY });
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    [startDrag]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      event.preventDefault();
      updateDrag(event.clientX, event.clientY);
    },
    [updateDrag]
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== event.pointerId) return;
      cancelDrag();
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    },
    [cancelDrag]
  );

  const onTouchStart = useCallback(
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

  const onTouchMove = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      const dragState = dragRef.current;
      if (!dragState || dragState.touchId === null) return;

      const activeTouch = Array.from(event.changedTouches).find((touch) => touch.identifier === dragState.touchId);
      if (!activeTouch) return;

      event.preventDefault();
      updateDrag(activeTouch.clientX, activeTouch.clientY);
    },
    [updateDrag]
  );

  const onTouchEnd = useCallback(
    (event: React.TouchEvent<HTMLDivElement>) => {
      if (typeof window !== "undefined" && window.PointerEvent) return;
      const dragState = dragRef.current;
      if (!dragState || dragState.touchId === null) return;

      const endedTouch = Array.from(event.changedTouches).find((touch) => touch.identifier === dragState.touchId);
      if (!endedTouch) return;

      cancelDrag();
    },
    [cancelDrag]
  );

  return {
    windowRef,
    position,
    isDragging,
    cancelDrag,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: onTouchEnd,
    },
  };
}
