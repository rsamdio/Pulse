"use client";

import { useEffect, useState } from "react";
import { onValue, ref, type Unsubscribe } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";
import type { EngagementRtdb, EngagementView } from "@/lib/types";
import type { RoomListenPhase } from "@/lib/hooks/useRoom";

/**
 * Live engagements from RTDB + the current user's responses.
 */
export function useEngagements(
  roomId: string | undefined,
  uid: string | undefined,
  phase: RoomListenPhase = "allowed",
) {
  const [engagements, setEngagements] = useState<EngagementView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !uid || phase === "denied") {
      setEngagements([]);
      setLoading(phase === "pending");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const db = getRtdb();
    const unsubs: Unsubscribe[] = [];

    let engagementMap: Record<string, EngagementView> = {};
    let myMap: Record<string, { optionId?: string; text?: string }> = {};
    let engagementsReady = false;
    let mineReady = false;
    let publishScheduled = false;

    const publishNow = () => {
      const list = Object.values(engagementMap)
        .map((e) => ({
          ...e,
          myOptionId: myMap[e.id]?.optionId ?? null,
          myText: myMap[e.id]?.text ?? null,
        }))
        .sort((a, b) => {
          if (a.status !== b.status) {
            return a.status === "live" ? -1 : 1;
          }
          return b.createdAt - a.createdAt;
        });
      setEngagements(list);
      if (engagementsReady && mineReady) setLoading(false);
    };

    const schedulePublish = () => {
      if (publishScheduled) return;
      publishScheduled = true;
      queueMicrotask(() => {
        publishScheduled = false;
        publishNow();
      });
    };

    const onListenError = (err: Error) => {
      if (phase === "pending") return;
      setError(err.message);
      setLoading(false);
    };

    unsubs.push(
      onValue(
        ref(db, `rooms/${roomId}/engagements`),
        (snap) => {
          const val = snap.val() as Record<string, EngagementRtdb> | null;
          engagementMap = {};
          if (val) {
            for (const [id, e] of Object.entries(val)) {
              engagementMap[id] = {
                id,
                ...e,
                responseCount: Number(e.responseCount ?? 0),
                resultsVisibility: e.resultsVisibility ?? "live",
                options: e.options ?? [],
                optionCounts: e.optionCounts ?? {},
                phrases: e.phrases ?? [],
              };
            }
          }
          engagementsReady = true;
          schedulePublish();
        },
        onListenError,
      ),
    );

    unsubs.push(
      onValue(
        ref(db, `userEngagementResponses/${uid}/${roomId}`),
        (snap) => {
          const val = snap.val() as Record<
            string,
            { optionId?: string; text?: string }
          > | null;
          myMap = val ?? {};
          mineReady = true;
          schedulePublish();
        },
        onListenError,
      ),
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [roomId, uid, phase]);

  const live = engagements.find((e) => e.status === "live") ?? null;

  return { engagements, live, loading, error };
}
