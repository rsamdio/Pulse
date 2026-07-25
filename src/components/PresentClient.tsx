"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { EngageCountdown } from "@/components/EngageCountdown";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { engagementTypeLabel, isFreeTextEngagement } from "@/lib/engagement";
import { usePresentRoom } from "@/lib/hooks/usePresentRoom";
import { useEngageControl } from "@/lib/hooks/useEngageControl";
import { useServerTimeOffset } from "@/lib/hooks/useServerTimeOffset";
import { useEngagementExpiry } from "@/lib/hooks/useEngagementExpiry";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";
import { layoutWordCloud } from "@/lib/wordCloudLayout";
import type { EngagementView } from "@/lib/types";
import type { RoomListenPhase } from "@/lib/hooks/useRoom";

function PresentResults({ eng }: { eng: EngagementView }) {
  const total = Math.max(1, eng.responseCount);
  const sortedPhrases = useMemo(
    () =>
      [...(eng.phrases ?? [])].sort(
        (a, b) => b.count - a.count || a.text.localeCompare(b.text),
      ),
    [eng.phrases],
  );
  const cloudItems = useMemo(
    () => (eng.type === "word_cloud" ? layoutWordCloud(sortedPhrases) : []),
    [eng.type, sortedPhrases],
  );

  if (eng.type === "mcq") {
    return (
      <div className="engage-options present-options">
        {(eng.options ?? []).map((opt, index) => {
          const count = Number(eng.optionCounts?.[opt.id] ?? 0);
          const pct = Math.round((count / total) * 100);
          const letter = String.fromCharCode(65 + index);
          return (
            <div key={opt.id} className="engage-option engage-option-locked">
              <div className="engage-option-row">
                <span className="engage-option-main">
                  <span className="engage-option-letter" aria-hidden>
                    {letter}
                  </span>
                  <span className="engage-option-label">{opt.label}</span>
                </span>
                <span className="engage-option-meta">
                  <span className="engage-option-pct">{pct}%</span>
                  <span className="engage-option-count">{count}</span>
                </span>
              </div>
              <div className="engage-bar-track" aria-hidden>
                <div className="engage-bar-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (!isFreeTextEngagement(eng.type)) return null;

  if (sortedPhrases.length === 0) {
    return <p className="engage-hint">Waiting for answers…</p>;
  }

  if (eng.type === "word_cloud") {
    return (
      <div className="engage-results">
        <div
          className="engage-cloud-scatter present-cloud"
          role="list"
          aria-label="Word cloud"
        >
          {cloudItems.map((item) => (
            <span
              key={item.text}
              role="listitem"
              className={[
                "engage-cloud-word",
                item.weight === "bold"
                  ? "engage-cloud-word-bold"
                  : item.weight === "semibold"
                    ? "engage-cloud-word-strong"
                    : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{
                left: `${item.x}%`,
                top: `${item.y}%`,
                fontSize: `${item.fontSize * 1.35}rem`,
              }}
            >
              {item.text}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="engage-results">
      <ul className="engage-answer-feed" role="list">
        {sortedPhrases.map((p) => (
          <li key={p.text} className="engage-answer-row">
            <p className="engage-answer-text">{p.text}</p>
            {p.count > 1 ? (
              <span className="engage-answer-count">{p.count}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PresentStage({ roomId }: { roomId: string }) {
  const { user } = useAuth();
  const [gate, setGate] = useState<{
    allowed: boolean;
    needsJoinCode: boolean;
  } | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    setGateError(null);
    try {
      const res = await api.getRoomAccess({ roomId });
      setGate({ allowed: res.allowed, needsJoinCode: res.needsJoinCode });
    } catch (err) {
      setGateError(err instanceof Error ? err.message : "Access check failed");
    }
  }, [roomId]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  const listenPhase: RoomListenPhase =
    gate === null ? "pending" : gate.allowed ? "allowed" : "denied";

  const { meta, engagements, live } = usePresentRoom(
    user?.uid ? roomId : undefined,
    user?.uid,
    listenPhase,
  );
  const { control } = useEngageControl(
    user?.uid ? roomId : undefined,
    user?.uid,
    listenPhase,
  );
  const serverOffset = useServerTimeOffset();

  const phase = control?.phase ?? "idle";

  useEngagementExpiry({
    roomId,
    enabled: gate?.allowed ?? false,
    phase: control?.phase,
    generation: control?.generation,
    advanceAt: control?.advanceAt ?? null,
    liveEndsAt: live?.liveEndsAt ?? null,
    serverOffset,
  });

  useDocumentTitle(meta?.title ? `Present · ${meta.title}` : "Present");

  const active =
    control?.activeEngagementId != null
      ? (engagements.find((e) => e.id === control.activeEngagementId) ?? null)
      : null;
  const current = live ?? (phase === "grace" ? active : null);

  if (gateError) {
    return (
      <div className="present-shell">
        <div className="present-empty">
          <p className="present-empty-title">{gateError}</p>
        </div>
      </div>
    );
  }

  if (gate && !gate.allowed) {
    return (
      <div className="present-shell">
        <div className="present-empty">
          <p className="present-empty-title">No access to this room</p>
          <p className="present-empty-sub">
            Open the room and enter it once, then reopen the present view.
          </p>
          <Link href={`/rooms/${roomId}`} className="btn btn-primary btn-sm">
            Open room
          </Link>
        </div>
      </div>
    );
  }

  if (gate === null) {
    return (
      <div className="present-shell">
        <div className="present-empty">
          <p className="present-empty-sub">Opening present view…</p>
        </div>
      </div>
    );
  }

  const showResults = (eng: EngagementView) => {
    const revealed = Boolean(eng.resultsRevealed) || eng.status === "closed";
    return (eng.resultsVisibility ?? "live") === "live" || revealed;
  };

  const waitingNext =
    phase === "held" || Boolean(control?.reservedNextId) || phase === "grace";

  return (
    <div className="present-shell">
      <header className="present-topbar">
        <span className="badge badge-live">Live</span>
        <span className="present-room-title">{meta?.title ?? "Room"}</span>
      </header>

      {current ? (
        <section className="present-stage">
          <div className="present-badge-row">
            <span className="badge">{engagementTypeLabel(current.type)}</span>
            {current.status === "live" && current.liveEndsAt != null ? (
              <EngageCountdown
                liveEndsAt={current.liveEndsAt}
                serverOffset={serverOffset}
                className="present-countdown"
              />
            ) : null}
            {current.status === "closed" ? (
              <span className="badge">Closed</span>
            ) : null}
          </div>

          <h1 className="present-prompt">{current.prompt}</h1>

          <p className="present-count">
            {current.responseCount} response
            {current.responseCount === 1 ? "" : "s"}
          </p>

          {showResults(current) ? (
            <div className="present-results">
              <PresentResults eng={current} />
            </div>
          ) : (
            <p className="present-hidden">
              Results are hidden until the host reveals or closes this prompt.
            </p>
          )}

          {phase === "grace" && control?.advanceAt != null ? (
            <div className="present-next" role="status" aria-live="polite">
              Next prompt in{" "}
              <EngageCountdown
                liveEndsAt={control.advanceAt}
                serverOffset={serverOffset}
                warningUnderSec={4}
                className="present-next-count"
              />
            </div>
          ) : null}
        </section>
      ) : (
        <section className="present-stage present-stage-empty">
          <div className="present-empty">
            <p className="present-empty-title">
              {engagements.length === 0 || waitingNext
                ? "Waiting for the next prompt"
                : "That’s the last prompt"}
            </p>
            <p className="present-empty-sub">
              The host controls what appears here.
            </p>
          </div>
        </section>
      )}

      <footer className="present-tip">
        Tip: share this window on the projector and keep the room open on your
        phone to control prompts.
      </footer>
    </div>
  );
}

export function PresentClient({ roomId }: { roomId: string }) {
  return (
    <RequireAuth>
      <PresentStage roomId={roomId} />
    </RequireAuth>
  );
}
