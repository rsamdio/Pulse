"use client";

import { memo, useEffect, useState } from "react";
import type { QuestionView } from "@/lib/types";
import {
  formatRelativeTime,
  questionDetails,
  questionHeadline,
} from "@/lib/utils";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const DESCRIPTION_PREVIEW_CHARS = 110;

function QuestionCardInner({
  question,
  rank,
  anonymous = false,
  disabled,
  canModerate,
  onVote,
  onDelete,
  onToggleAnswered,
}: {
  question: QuestionView;
  rank: number;
  anonymous?: boolean;
  disabled?: boolean;
  canModerate?: boolean;
  onVote: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  onToggleAnswered?: (id: string, answered: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [modError, setModError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<{
    hasVoted: boolean;
    voteCount: number;
  } | null>(null);

  const answered = Boolean(question.answered);
  const hasVoted = optimistic?.hasVoted ?? question.hasVoted;
  const voteCount = optimistic?.voteCount ?? question.voteCount;

  // Reconcile when RTDB catches up with the optimistic click.
  useEffect(() => {
    setOptimistic(null);
  }, [question.hasVoted, question.voteCount]);

  const handleVote = async () => {
    if (disabled || busy) return;
    const nextVoted = !hasVoted;
    const nextCount = Math.max(0, voteCount + (nextVoted ? 1 : -1));
    setOptimistic({ hasVoted: nextVoted, voteCount: nextCount });
    setBusy(true);
    setVoteError(null);
    setPulse(true);
    window.setTimeout(() => setPulse(false), 700);
    try {
      await onVote(question.id);
    } catch (err) {
      setOptimistic(null);
      setVoteError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!onDelete) return;
    setDeleting(true);
    setModError(null);
    try {
      await onDelete(question.id);
      setConfirmOpen(false);
    } catch (err) {
      setModError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  };

  const handleToggleAnswered = async () => {
    if (!onToggleAnswered || answering) return;
    setAnswering(true);
    setModError(null);
    try {
      await onToggleAnswered(question.id, !answered);
    } catch (err) {
      setModError(
        err instanceof Error ? err.message : "Could not update answered state",
      );
    } finally {
      setAnswering(false);
    }
  };

  const headline = questionHeadline(question);
  const description = questionDetails(question);
  const authorLabel = anonymous ? "Anonymous" : question.authorName;
  const canCollapse =
    description.length > DESCRIPTION_PREVIEW_CHARS ||
    description.split("\n").length > 2;
  const shownDescription =
    !expanded && canCollapse
      ? `${description.slice(0, DESCRIPTION_PREVIEW_CHARS).trimEnd()}…`
      : description;

  return (
    <>
      <article
        className={`question-card ${pulse ? "vote-pulse" : ""} ${
          answered ? "question-card-answered" : ""
        }`}
      >
        <div className="flex gap-3">
          <div className="vote-rail">
            <span className="rank-mark" aria-label={`Rank ${rank}`}>
              #{rank}
            </span>
            <button
              type="button"
              className={`vote-btn ${hasVoted ? "vote-btn-on" : ""}`}
              disabled={disabled || busy}
              onClick={() => void handleVote()}
              aria-pressed={hasVoted}
              aria-label={
                hasVoted ? "Remove your upvote" : "Upvote this question"
              }
              title={
                hasVoted ? "Click to remove your upvote" : "Click to upvote"
              }
            >
              <span className="vote-chevron" aria-hidden>
                ▲
              </span>
              <span className="vote-count">{voteCount}</span>
              <span className="vote-label">
                {hasVoted ? "Upvoted" : "Upvote"}
              </span>
            </button>
          </div>

          <div className="question-body">
            <div className="question-heading">
              {answered ? (
                <span className="answered-badge">Answered</span>
              ) : null}
              <h3 className="question-title">{headline}</h3>
            </div>

            {description ? (
              <div className="question-description">
                <p
                  className={
                    expanded
                      ? "question-description-copy is-expanded"
                      : "question-description-copy"
                  }
                >
                  {shownDescription}
                </p>
                {canCollapse ? (
                  <button
                    type="button"
                    className="show-more-btn"
                    onClick={() => setExpanded((v) => !v)}
                    aria-expanded={expanded}
                  >
                    {expanded ? "Show less" : "Show more"}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="question-meta">
              <span className="question-author">{authorLabel}</span>
              <span aria-hidden>·</span>
              <time dateTime={new Date(question.createdAt).toISOString()}>
                {formatRelativeTime(question.createdAt)}
              </time>
              {hasVoted ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="question-upvoted">You upvoted</span>
                </>
              ) : null}
            </div>

            {canModerate ? (
              <div
                className="moderate-actions"
                role="group"
                aria-label="Moderate question"
                aria-busy={answering || deleting || undefined}
              >
                {onToggleAnswered ? (
                  <button
                    type="button"
                    className={`moderate-answer${answered ? " is-answered" : ""}`}
                    disabled={answering || deleting}
                    onClick={() => void handleToggleAnswered()}
                  >
                    {answering
                      ? "Saving…"
                      : answered
                        ? "Mark unanswered"
                        : "Mark answered"}
                  </button>
                ) : null}
                {onDelete ? (
                  <button
                    type="button"
                    className="moderate-delete"
                    disabled={deleting || answering}
                    onClick={() => setConfirmOpen(true)}
                    aria-label="Remove question"
                  >
                    {deleting ? "Removing…" : "Remove"}
                  </button>
                ) : null}
              </div>
            ) : null}

            {voteError ? (
              <p className="question-error" role="alert">
                {voteError}
              </p>
            ) : null}
            {modError ? (
              <p className="question-error" role="alert">
                {modError}
              </p>
            ) : null}
          </div>
        </div>
      </article>

      <ConfirmDialog
        open={confirmOpen}
        title="Remove this question?"
        description={
          <>
            <p className="mb-2 font-medium text-ink line-clamp-2">
              “{headline}”
            </p>
            <p>
              It will disappear from the live board for everyone. This cannot be
              undone.
            </p>
          </>
        }
        confirmLabel="Remove question"
        cancelLabel="Keep it"
        danger
        busy={deleting}
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </>
  );
}

export const QuestionCard = memo(QuestionCardInner);
