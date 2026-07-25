"use client";

import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Leaf countdown near a Live badge. Owns its own 1s ticker so parents never
 * re-render (and never re-fetch) on each tick. Text-only, reduced-motion safe.
 */
export function EngageCountdown({
  liveEndsAt,
  serverOffset,
  warningUnderSec = 10,
  className,
}: {
  liveEndsAt: number | null | undefined;
  serverOffset: number;
  warningUnderSec?: number;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (liveEndsAt == null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [liveEndsAt]);

  if (liveEndsAt == null) return null;

  const remaining = liveEndsAt - (now + serverOffset);
  const warn = remaining <= warningUnderSec * 1000;
  const label = formatRemaining(remaining);

  return (
    <span
      className={[
        "engage-countdown",
        warn ? "engage-countdown-warn" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role="timer"
      aria-live="off"
      aria-label={`Time remaining ${label}`}
    >
      {remaining <= 0 ? "0:00" : label}
    </span>
  );
}
