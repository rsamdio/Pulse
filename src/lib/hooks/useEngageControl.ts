"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";
import type { EngageControlRtdb } from "@/lib/types";
import type { RoomListenPhase } from "@/lib/hooks/useRoom";

/**
 * Public engage control (phase / advanceAt / generation) from RTDB.
 * Drives Present countdowns and the host grace / held banners.
 */
export function useEngageControl(
  roomId: string | undefined,
  uid: string | undefined,
  phase: RoomListenPhase = "allowed",
) {
  const [control, setControl] = useState<EngageControlRtdb | null>(null);

  useEffect(() => {
    if (!roomId || !uid || phase === "denied") {
      setControl(null);
      return;
    }
    const db = getRtdb();
    const unsub = onValue(
      ref(db, `rooms/${roomId}/engageControl`),
      (snap) => {
        const val = snap.val() as EngageControlRtdb | null;
        setControl(
          val
            ? {
                phase: val.phase ?? "idle",
                advanceAt: val.advanceAt ?? null,
                generation: Number(val.generation ?? 0),
                activeEngagementId: val.activeEngagementId ?? null,
                reservedNextId: val.reservedNextId ?? null,
              }
            : null,
        );
      },
      () => {
        setControl(null);
      },
    );
    return () => unsub();
  }, [roomId, uid, phase]);

  return { control };
}
