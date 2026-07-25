"use client";

import { useEffect } from "react";
import { api } from "@/lib/api";
import type { EngagePhase } from "@/lib/types";

/** Small buffer so we never fire before the server considers the window over. */
const FIRE_BUFFER_MS = 300;

/**
 * Client backstop for timed engagements. Schedules a single timer per mount:
 * - phase "live" with a liveEndsAt: expire + advance when the timer elapses.
 * - phase "grace" with an advanceAt: complete the auto-advance grace window.
 *
 * The callable is idempotent (server returns `alreadyAdvanced`), so it is safe
 * for both the host pane and every Present client to run this in parallel.
 */
export function useEngagementExpiry(params: {
  roomId: string | undefined;
  enabled: boolean;
  phase: EngagePhase | undefined;
  generation: number | undefined;
  advanceAt: number | null;
  liveEndsAt: number | null;
  serverOffset: number;
}): void {
  const {
    roomId,
    enabled,
    phase,
    generation,
    advanceAt,
    liveEndsAt,
    serverOffset,
  } = params;

  useEffect(() => {
    if (!roomId || !enabled) return;

    let target: number | null = null;
    let run: (() => Promise<unknown>) | null = null;

    if (phase === "live" && liveEndsAt != null) {
      target = liveEndsAt;
      run = () =>
        api.advanceEngagement({
          roomId,
          expectedLiveEndsAt: liveEndsAt,
          expectedGeneration: generation,
        });
    } else if (phase === "grace" && advanceAt != null) {
      target = advanceAt;
      run = () =>
        api.advanceEngagement({
          roomId,
          completeGrace: true,
          expectedGeneration: generation,
        });
    }

    if (target == null || run == null) return;

    const serverNow = Date.now() + serverOffset;
    const delay = Math.max(0, target - serverNow) + FIRE_BUFFER_MS;
    const fire = run;
    const id = window.setTimeout(() => {
      void fire().catch(() => {
        // Idempotent server-side; Cloud Tasks backstop covers hard failures.
      });
    }, delay);

    return () => window.clearTimeout(id);
  }, [roomId, enabled, phase, generation, advanceAt, liveEndsAt, serverOffset]);
}
