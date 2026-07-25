"use client";

import { useEffect, useState } from "react";
import { onValue, ref, type Unsubscribe } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";
import type {
  DraftQueueEntry,
  EngagementRtdb,
  EngagementView,
  PrivateEngagementResult,
} from "@/lib/types";
import type { RoomListenPhase } from "@/lib/hooks/useRoom";

function parseEngagement(id: string, e: EngagementRtdb): EngagementView {
  return {
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
  };
}

/**
 * Live engagements from RTDB + the current user's responses.
 *
 * When `includePrivateResults` is true (organizer Engage only) this also
 * subscribes to the room's private Peek tallies and draft queue. Private read
 * errors are soft (cleared, not fatal) so attendees / non-organizers are safe.
 */
export function useEngagements(
  roomId: string | undefined,
  uid: string | undefined,
  phase: RoomListenPhase = "allowed",
  opts?: { includePrivateResults?: boolean },
) {
  const includePrivateResults = opts?.includePrivateResults ?? false;
  const [engagements, setEngagements] = useState<EngagementView[]>([]);
  const [privateResults, setPrivateResults] = useState<
    Record<string, PrivateEngagementResult>
  >({});
  const [draftQueue, setDraftQueue] = useState<Record<
    string,
    DraftQueueEntry
  > | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId || !uid || phase === "denied") {
      setEngagements([]);
      setPrivateResults({});
      setDraftQueue(null);
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
              engagementMap[id] = parseEngagement(id, e);
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

    if (includePrivateResults) {
      unsubs.push(
        onValue(
          ref(db, `rooms/${roomId}/private/engagementResults`),
          (snap) => {
            const val = snap.val() as Record<
              string,
              PrivateEngagementResult
            > | null;
            setPrivateResults(val ?? {});
          },
          () => {
            // Non-organizer or race before mirror; Peek simply unavailable.
            setPrivateResults({});
          },
        ),
      );

      unsubs.push(
        onValue(
          ref(db, `rooms/${roomId}/private/draftQueue`),
          (snap) => {
            const val = snap.val() as Record<string, DraftQueueEntry> | null;
            setDraftQueue(val);
          },
          () => {
            setDraftQueue(null);
          },
        ),
      );
    }

    return () => {
      for (const u of unsubs) u();
    };
  }, [roomId, uid, phase, includePrivateResults]);

  const live = engagements.find((e) => e.status === "live") ?? null;

  return { engagements, live, loading, error, privateResults, draftQueue };
}
