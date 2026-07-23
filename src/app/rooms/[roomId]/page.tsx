"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { QuestionCard } from "@/components/QuestionCard";
import { AccessBadge } from "@/components/AccessBadge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import { useRoom } from "@/lib/hooks/useRoom";
import type { RoomDoc } from "@/lib/types";

function RoomView() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();
  const { user, profile } = useAuth();
  const [gate, setGate] = useState<{
    allowed: boolean;
    needsJoinCode: boolean;
    isOrganizer: boolean;
    room: RoomDoc | null;
  } | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [questionDescription, setQuestionDescription] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  const checkAccess = useCallback(async () => {
    setGateError(null);
    try {
      const res = await api.getRoomAccess({ roomId });
      setGate(res);
      if (res.needsJoinCode && !res.allowed) {
        router.replace(`/rooms/${roomId}/join`);
      }
    } catch (err) {
      setGateError(err instanceof Error ? err.message : "Access check failed");
    }
  }, [roomId, router]);

  useEffect(() => {
    void checkAccess();
  }, [checkAccess]);

  const { meta, questions, loading, error } = useRoom(
    gate?.allowed ? roomId : undefined,
    user?.uid,
  );

  const isOrganizer = gate?.isOrganizer ?? false;
  const questionsLocked =
    meta?.questionsLocked ?? gate?.room?.questionsLocked ?? false;
  const viewOnly = meta?.viewOnly ?? gate?.room?.viewOnly ?? false;
  const canCompose = isOrganizer || (!questionsLocked && !viewOnly);
  const canVote = isOrganizer || !viewOnly;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCompose || !question.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await api.createQuestion({
        roomId,
        question: question.trim(),
        description: questionDescription.trim(),
      });
      setQuestion("");
      setQuestionDescription("");
      setComposeOpen(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  const onVote = async (questionId: string) => {
    await api.voteQuestion({ roomId, questionId });
  };

  const onDelete = async (questionId: string) => {
    await api.deleteQuestion({ roomId, questionId });
  };

  const onToggleAnswered = async (questionId: string, answered: boolean) => {
    await api.setQuestionAnswered({ roomId, questionId, answered });
  };

  if (gateError) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] p-4 text-sm text-[var(--danger)]">
        {gateError}
      </div>
    );
  }

  if (!gate || (gate.allowed && loading && !meta)) {
    return (
      <p className="mt-12 text-center text-sm text-[var(--ink-muted)]">
        Opening room…
      </p>
    );
  }

  if (!gate.allowed) {
    return (
      <div className="panel mx-auto mt-10 max-w-md text-center">
        <h1 className="font-[family-name:var(--font-display)] text-2xl">
          No access
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          This room is restricted. Ask the organizer for an invite or entry
          code.
        </p>
        <Link href="/rooms" className="btn btn-ghost mt-5">
          Back to rooms
        </Link>
      </div>
    );
  }

  const title = meta?.title ?? gate.room?.title ?? "Room";
  const roomDescription = meta?.description ?? gate.room?.description ?? "";
  const accessMode = meta?.accessMode ?? gate.room?.accessMode ?? "public";
  const isAnonymous =
    Boolean(meta?.anonymous) || Boolean(gate.room?.anonymous);

  return (
    <div
      className={`mx-auto w-full max-w-3xl ${canCompose ? "pb-28" : "pb-6"}`}
    >
      <header className="panel room-hero">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="badge badge-live">Live</span>
          <AccessBadge mode={accessMode} variant="room" />
          {isAnonymous ? <span className="badge badge-gold">Anonymous</span> : null}
          {isOrganizer ? <span className="badge badge-pink">Hosting</span> : null}
          {questionsLocked ? <span className="badge">Locked</span> : null}
          {viewOnly ? <span className="badge">View only</span> : null}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-tight tracking-tight text-[var(--secondary)] sm:text-3xl">
              {title}
            </h1>
            {roomDescription ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">
                {roomDescription}
              </p>
            ) : null}
          </div>
          {isOrganizer ? (
            <Link
              href={`/rooms/${roomId}/manage`}
              className="btn btn-secondary btn-sm shrink-0"
            >
              Manage room
            </Link>
          ) : null}
        </div>
        <div className="room-hero-meta">
          <span>
            {questions.length} question{questions.length === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span>Sorted by votes</span>
        </div>
      </header>

      {!canCompose ? (
        <p className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--ink-soft)]">
          {viewOnly
            ? "View-only mode is on. You can watch the board update live."
            : "New questions are locked. You can still upvote existing ones."}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="mt-6 mb-2 flex items-baseline justify-between gap-3">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--secondary)] sm:text-xl">
          Questions
        </h2>
      </div>

      <div className="space-y-2.5">
        {questions.length === 0 && !loading ? (
          <div className="empty-board">
            <p className="font-[family-name:var(--font-display)] text-lg">
              No questions yet
            </p>
            <p className="mt-1 text-sm text-[var(--ink-soft)]">
              Be the first to ask something worth answering.
            </p>
          </div>
        ) : null}
        {questions.map((q, index) => (
          <QuestionCard
            key={q.id}
            question={q}
            rank={index + 1}
            anonymous={isAnonymous}
            disabled={!canVote}
            canModerate={isOrganizer}
            onVote={onVote}
            onDelete={onDelete}
            onToggleAnswered={onToggleAnswered}
          />
        ))}
      </div>

      {canCompose ? (
        <div className="compose-dock">
          <div className="compose-dock-inner">
            {!composeOpen ? (
              <form
                className="compose-bar"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (question.trim()) {
                    void onSubmit(e);
                  } else {
                    setComposeOpen(true);
                  }
                }}
              >
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onFocus={() => setComposeOpen(true)}
                  maxLength={200}
                  placeholder="Ask a question…"
                  aria-label="Ask a question"
                />
                <button
                  type="button"
                  className="btn btn-primary btn-sm shrink-0"
                  onClick={() => setComposeOpen(true)}
                >
                  Ask
                </button>
              </form>
            ) : (
              <form
                onSubmit={(e) => void onSubmit(e)}
                className="compose-panel space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-[var(--ink)]">
                    {isAnonymous
                      ? "Ask anonymously"
                      : `Ask as ${profile?.displayName ?? "you"}`}
                  </p>
                  <button
                    type="button"
                    className="text-[0.7rem] font-medium text-[var(--ink-muted)] underline"
                    onClick={() => setComposeOpen(false)}
                  >
                    Close
                  </button>
                </div>
                <label className="block space-y-1">
                  <span className="label-caps">Question</span>
                  <input
                    className="field"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    maxLength={200}
                    placeholder="What do you want answered?"
                    required
                    autoFocus
                  />
                </label>
                <label className="block space-y-1">
                  <span className="label-caps">
                    Description{" "}
                    <span className="normal-case tracking-normal text-[var(--ink-muted)]">
                      optional
                    </span>
                  </span>
                  <textarea
                    className="field min-h-[4rem]"
                    value={questionDescription}
                    onChange={(e) => setQuestionDescription(e.target.value)}
                    maxLength={1000}
                    placeholder="Context or why it matters…"
                  />
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[0.65rem] text-[var(--ink-muted)]">
                    {question.length}/200 · {questionDescription.length}/1000
                  </span>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={submitting || !question.trim()}
                  >
                    {submitting ? "Posting…" : "Submit"}
                  </button>
                </div>
                {submitError ? (
                  <p className="text-xs text-[var(--danger)]">{submitError}</p>
                ) : null}
              </form>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function RoomPage() {
  return (
    <RequireAuth>
      <RoomView />
    </RequireAuth>
  );
}
