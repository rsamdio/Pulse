"use client";

import { useEffect, useState } from "react";
import { onValue, ref, type Unsubscribe } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";
import type {
  EngagementRtdb,
  EngagementView,
  RoomMetaRtdb,
} from "@/lib/types";
import type { RoomListenPhase } from "@/lib/hooks/useRoom";

/**
 * Lean listener for the Present screen: meta + public engagements only.
 * No questions, votes, private tallies, or personal responses — keeps the
 * projector view small and read-only.
 */
export function usePresentRoom(
  roomId: string | undefined,
  uid: string | undefined,
  phase: RoomListenPhase = "allowed",
) {
  const [meta, setMeta] = useState<RoomMetaRtdb | null>(null);
  const [engagements, setEngagements] = useState<EngagementView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !uid || phase === "denied") {
      setMeta(null);
      setEngagements([]);
      setLoading(phase === "pending");
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const db = getRtdb();
    const unsubs: Unsubscribe[] = [];

    let metaReady = false;
    let engagementsReady = false;

    const settle = () => {
      if (metaReady && engagementsReady) setLoading(false);
    };

    const onListenError = (err: Error) => {
      if (phase === "pending") return;
      setError(err.message);
      setLoading(false);
    };

    unsubs.push(
      onValue(
        ref(db, `rooms/${roomId}/meta`),
        (snap) => {
          setMeta(snap.exists() ? (snap.val() as RoomMetaRtdb) : null);
          metaReady = true;
          settle();
        },
        onListenError,
      ),
    );

    unsubs.push(
      onValue(
        ref(db, `rooms/${roomId}/engagements`),
        (snap) => {
          const val = snap.val() as Record<string, EngagementRtdb> | null;
          const list: EngagementView[] = [];
          if (val) {
            for (const [id, e] of Object.entries(val)) {
              list.push({
                id,
                ...e,
                responseCount: Number(e.responseCount ?? 0),
                resultsVisibility: e.resultsVisibility ?? "live",
                resultsRevealed: Boolean(e.resultsRevealed),
                revision: Number(e.revision ?? 0),
                sortOrder: Number(e.sortOrder ?? e.createdAt ?? 0),
                durationSec: e.durationSec ?? null,
                autoAdvance: Boolean(e.autoAdvance),
                liveEndsAt: e.liveEndsAt ?? null,
                liveStartedAt: e.liveStartedAt ?? null,
                options: e.options ?? [],
                optionCounts: e.optionCounts ?? {},
                phrases: e.phrases ?? [],
              });
            }
          }
          list.sort((a, b) => {
            if (a.status !== b.status) return a.status === "live" ? -1 : 1;
            return b.createdAt - a.createdAt;
          });
          setEngagements(list);
          engagementsReady = true;
          settle();
        },
        onListenError,
      ),
    );

    return () => {
      for (const u of unsubs) u();
    };
  }, [roomId, uid, phase]);

  const live = engagements.find((e) => e.status === "live") ?? null;

  return { meta, engagements, live, loading, error };
}
