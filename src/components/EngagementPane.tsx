"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import type {
  EngagementDoc,
  EngagementResultsVisibility,
  EngagementType,
  EngagementView,
} from "@/lib/types";

export function EngagementPane({
  roomId,
  engagements,
  live,
  isOrganizer,
  canRespond,
  loading,
}: {
  roomId: string;
  engagements: EngagementView[];
  live: EngagementView | null;
  isOrganizer: boolean;
  canRespond: boolean;
  loading: boolean;
}) {
  const [drafts, setDrafts] = useState<EngagementDoc[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<EngagementType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [resultsVisibility, setResultsVisibility] =
    useState<EngagementResultsVisibility>("live");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    EngagementView | EngagementDoc | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const resetCompose = () => {
    setEditingId(null);
    setType("mcq");
    setPrompt("");
    setOptions(["", ""]);
    setResultsVisibility("live");
    setComposeOpen(false);
  };

  const loadDrafts = useCallback(async () => {
    if (!isOrganizer) {
      setDrafts([]);
      return;
    }
    try {
      const res = await api.listEngagements({ roomId });
      setDrafts(res.engagements.filter((e) => e.status === "draft"));
    } catch {
      // RTDB live board still works; drafts are best-effort
    }
  }, [isOrganizer, roomId]);

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts]);

  const openCreate = () => {
    if (composeOpen && !editingId) {
      resetCompose();
      return;
    }
    setEditingId(null);
    setType("mcq");
    setPrompt("");
    setOptions(["", ""]);
    setResultsVisibility("live");
    setComposeOpen(true);
  };

  const openEdit = (eng: EngagementDoc) => {
    setEditingId(eng.id);
    setType(eng.type);
    setPrompt(eng.prompt);
    setOptions(
      eng.type === "mcq" && eng.options.length > 0
        ? eng.options.map((o) => o.label)
        : ["", ""],
    );
    setResultsVisibility(eng.resultsVisibility ?? "live");
    setComposeOpen(true);
    setError(null);
  };

  const saveDraft = async (e: FormEvent) => {
    e.preventDefault();
    if (!isOrganizer) return;
    setBusy(true);
    setError(null);
    try {
      const optionLabels =
        type === "mcq"
          ? options.map((o) => o.trim()).filter(Boolean)
          : undefined;
      if (editingId) {
        await api.updateEngagement({
          roomId,
          engagementId: editingId,
          prompt: prompt.trim(),
          options: optionLabels,
          resultsVisibility,
        });
      } else {
        await api.createEngagement({
          roomId,
          type,
          prompt: prompt.trim(),
          options: optionLabels,
          resultsVisibility,
          startLive: false,
        });
      }
      resetCompose();
      await loadDrafts();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingId
            ? "Could not update"
            : "Could not create",
      );
    } finally {
      setBusy(false);
    }
  };

  const goLive = async (engagementId: string) => {
    setBusy(true);
    setError(null);
    try {
      await api.goLiveEngagement({ roomId, engagementId });
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not go live");
    } finally {
      setBusy(false);
    }
  };

  const closeLive = async () => {
    if (!live) return;
    setBusy(true);
    setError(null);
    try {
      await api.closeEngagement({ roomId, engagementId: live.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteEngagement({
        roomId,
        engagementId: deleteTarget.id,
      });
      if (editingId === deleteTarget.id) resetCompose();
      setDeleteTarget(null);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--secondary)] sm:text-xl">
            Engage
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
            {isOrganizer
              ? "Go live from a draft, or create one here. Prep more in Manage."
              : "Answer the live prompt from your host."}
          </p>
        </div>
        {isOrganizer ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={openCreate}
          >
            {composeOpen && !editingId ? "Cancel" : "New draft"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {isOrganizer && composeOpen ? (
        <form onSubmit={(e) => void saveDraft(e)} className="panel space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">
              {editingId ? "Edit draft" : "New draft"}
            </p>
            {editingId ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={resetCompose}
              >
                Cancel edit
              </button>
            ) : null}
          </div>
          {!editingId ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={`mode-card flex-1 text-left ${type === "mcq" ? "mode-card-on" : ""}`}
                onClick={() => setType("mcq")}
              >
                <span className="font-semibold">Multiple choice</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  Single select, live bars
                </span>
              </button>
              <button
                type="button"
                className={`mode-card flex-1 text-left ${type === "open" ? "mode-card-on" : ""}`}
                onClick={() => setType("open")}
              >
                <span className="font-semibold">Open text</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  Short answers, word cloud
                </span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-muted)]">
              {type === "mcq" ? "Multiple choice" : "Open text"} (type cannot be
              changed)
            </p>
          )}
          <label className="block space-y-1">
            <span className="label-caps">Prompt</span>
            <input
              className="field"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={200}
              placeholder="What should people answer?"
              required
            />
          </label>
          {type === "mcq" ? (
            <div className="space-y-2">
              <span className="label-caps">Options</span>
              {options.map((opt, i) => (
                <input
                  key={i}
                  className="field"
                  value={opt}
                  onChange={(e) => {
                    const next = [...options];
                    next[i] = e.target.value;
                    setOptions(next);
                  }}
                  maxLength={80}
                  placeholder={`Option ${i + 1}`}
                  required
                />
              ))}
              <div className="flex flex-wrap gap-2">
                {options.length < 6 ? (
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => setOptions([...options, ""])}
                  >
                    Add option
                  </button>
                ) : null}
                {options.length > 2 ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setOptions(options.slice(0, -1))}
                  >
                    Remove last
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
          <fieldset className="space-y-2">
            <legend className="label-caps">Results</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                checked={resultsVisibility === "live"}
                onChange={() => setResultsVisibility("live")}
              />
              <span>After each person answers</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                checked={resultsVisibility === "after_close"}
                onChange={() => setResultsVisibility("after_close")}
              />
              <span>Hide from attendees until closed</span>
            </label>
          </fieldset>
          {live ? (
            <p className="text-xs text-[var(--ink-muted)]">
              Going live later will close the current live engagement.
            </p>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !prompt.trim()}
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Save draft"}
          </button>
        </form>
      ) : null}

      {isOrganizer && drafts.length > 0 ? (
        <div className="space-y-2">
          <p className="label-caps">Drafts</p>
          {drafts.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold line-clamp-2">{d.prompt}</p>
                <p className="text-xs text-[var(--ink-muted)]">
                  {d.type === "mcq" ? "Multiple choice" : "Open text"}
                  {" · "}
                  {d.resultsVisibility === "after_close"
                    ? "Hide until closed"
                    : "After each answers"}
                </p>
                {d.type === "mcq" && d.options.length > 0 ? (
                  <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-xs text-[var(--ink-soft)]">
                    {d.options.map((opt) => (
                      <li key={opt.id}>{opt.label}</li>
                    ))}
                  </ol>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => openEdit(d)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy}
                  onClick={() => void goLive(d.id)}
                >
                  Go live
                </button>
                <button
                  type="button"
                  className="btn btn-outline btn-sm text-[var(--danger)]"
                  disabled={busy}
                  onClick={() => setDeleteTarget(d)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {loading && engagements.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading engagements…</p>
      ) : null}

      {!loading && engagements.length === 0 && drafts.length === 0 ? (
        <div className="empty-board">
          <p className="font-[family-name:var(--font-display)] text-lg">
            No engagements yet
          </p>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            {isOrganizer
              ? "Create a draft here or in Manage, then go live."
              : "When the organizer goes live, you can answer here."}
          </p>
        </div>
      ) : null}

      <div className="space-y-3">
        {engagements.map((eng) => (
          <EngagementCard
            key={eng.id}
            roomId={roomId}
            engagement={eng}
            isOrganizer={isOrganizer}
            canRespond={canRespond}
            busy={busy}
            onClose={eng.status === "live" ? () => void closeLive() : undefined}
            onDelete={() => setDeleteTarget(eng)}
            onError={setError}
          />
        ))}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this engagement?"
        description={
          deleteTarget ? (
            <>
              <p className="mb-2 font-medium line-clamp-2">
                “{deleteTarget.prompt}”
              </p>
              <p>Responses and results will be removed for everyone.</p>
            </>
          ) : null
        }
        confirmLabel="Delete"
        cancelLabel="Keep"
        danger
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function EngagementCard({
  roomId,
  engagement,
  isOrganizer,
  canRespond,
  busy,
  onClose,
  onDelete,
  onError,
}: {
  roomId: string;
  engagement: EngagementView;
  isOrganizer: boolean;
  canRespond: boolean;
  busy: boolean;
  onClose?: () => void;
  onDelete: () => void;
  onError: (msg: string | null) => void;
}) {
  const [openText, setOpenText] = useState(engagement.myText ?? "");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    engagement.myOptionId ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const total = Math.max(1, engagement.responseCount);
  const isLive = engagement.status === "live";
  const hasAnswered = Boolean(engagement.myOptionId || engagement.myText);
  const canAnswer = isLive && canRespond && !hasAnswered;
  const visibility = engagement.resultsVisibility ?? "live";
  const showTallies =
    isOrganizer ||
    engagement.status === "closed" ||
    (visibility === "live" && hasAnswered);

  const resultsHint = (() => {
    if (showTallies || !isLive) return null;
    if (visibility === "after_close") {
      return "Results appear when the host closes this prompt.";
    }
    if (!hasAnswered) {
      return "Answer to see live results.";
    }
    return null;
  })();

  useEffect(() => {
    if (engagement.myText != null) {
      setOpenText(engagement.myText);
    }
  }, [engagement.myText]);

  useEffect(() => {
    if (engagement.myOptionId) {
      setSelectedOptionId(engagement.myOptionId);
    }
  }, [engagement.myOptionId]);

  const submitMcq = async () => {
    if (!canAnswer || submitting || !selectedOptionId) return;
    setSubmitting(true);
    onError(null);
    try {
      await api.respondToEngagement({
        roomId,
        engagementId: engagement.id,
        optionId: selectedOptionId,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  const submitOpen = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAnswer || !openText.trim() || submitting) return;
    setSubmitting(true);
    onError(null);
    try {
      await api.respondToEngagement({
        roomId,
        engagementId: engagement.id,
        text: openText.trim(),
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setSubmitting(false);
    }
  };

  const sortedPhrases = [...(engagement.phrases ?? [])].sort(
    (a, b) => b.count - a.count || a.text.localeCompare(b.text),
  );
  const maxPhraseCount = Math.max(1, ...sortedPhrases.map((p) => p.count));
  const openRemaining = 60 - openText.length;

  return (
    <article
      className={[
        "engage-card panel !p-4 sm:!p-5",
        isLive ? "engage-card-live" : "engage-card-closed",
        hasAnswered ? "engage-card-answered" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {isLive ? (
              <span className="badge badge-live">Live</span>
            ) : (
              <span className="badge">Closed</span>
            )}
            {hasAnswered ? (
              <span className="badge badge-green">Answered</span>
            ) : null}
            <span className="badge">
              {engagement.type === "mcq" ? "Multiple choice" : "Open text"}
            </span>
            {visibility === "after_close" ? (
              <span className="badge">Hide until closed</span>
            ) : null}
          </div>
          <h3 className="engage-prompt">{engagement.prompt}</h3>
          <p className="engage-meta-line">
            {engagement.responseCount} response
            {engagement.responseCount === 1 ? "" : "s"}
            {hasAnswered && isLive ? " · Your answer is locked" : null}
          </p>
        </div>
        {isOrganizer ? (
          <div className="flex flex-wrap gap-2">
            {onClose ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy || submitting}
                onClick={onClose}
              >
                Close
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-outline btn-sm text-[var(--danger)]"
              disabled={busy || submitting}
              onClick={onDelete}
            >
              Delete
            </button>
          </div>
        ) : null}
      </div>

      {engagement.type === "mcq" ? (
        <div className="engage-options" role="radiogroup" aria-label="Choices">
          {(engagement.options ?? []).map((opt, index) => {
            const count = Number(engagement.optionCounts?.[opt.id] ?? 0);
            const pct = Math.round((count / total) * 100);
            const selected = hasAnswered
              ? engagement.myOptionId === opt.id
              : canAnswer && selectedOptionId === opt.id;
            const locked = hasAnswered || !canAnswer;
            const letter = String.fromCharCode(65 + index);
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={[
                  "engage-option",
                  selected ? "engage-option-on" : "",
                  locked && !selected ? "engage-option-muted" : "",
                  locked ? "engage-option-locked" : "",
                  showTallies ? "engage-option-with-results" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={!canAnswer || submitting}
                onClick={() => {
                  if (!canAnswer || submitting) return;
                  setSelectedOptionId(opt.id);
                }}
              >
                <div className="engage-option-row">
                  <span className="engage-option-main">
                    <span className="engage-option-letter" aria-hidden>
                      {selected ? "✓" : letter}
                    </span>
                    <span className="engage-option-label">{opt.label}</span>
                  </span>
                  {showTallies ? (
                    <span className="engage-option-meta">
                      <span className="engage-option-pct">{pct}%</span>
                      <span className="engage-option-count">{count}</span>
                    </span>
                  ) : selected && hasAnswered ? (
                    <span className="engage-option-yours">Your choice</span>
                  ) : null}
                </div>
                {showTallies ? (
                  <div className="engage-bar-track" aria-hidden>
                    <div
                      className="engage-bar-fill"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                ) : null}
              </button>
            );
          })}
          {canAnswer ? (
            <div className="engage-mcq-actions">
              <p className="engage-hint">
                Select an option, then submit. Your answer cannot be changed.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm engage-mcq-submit"
                disabled={submitting || !selectedOptionId}
                onClick={() => void submitMcq()}
              >
                {submitting ? "Submitting…" : "Submit answer"}
              </button>
            </div>
          ) : null}
          {resultsHint ? <p className="engage-hint">{resultsHint}</p> : null}
        </div>
      ) : (
        <div className="engage-open space-y-3">
          {canAnswer ? (
            <form
              onSubmit={(e) => void submitOpen(e)}
              className="engage-open-form"
            >
              <label className="engage-open-field">
                <span className="sr-only">Your answer</span>
                <input
                  className="field engage-open-input"
                  value={openText}
                  onChange={(e) => setOpenText(e.target.value)}
                  maxLength={60}
                  placeholder="Type a short answer…"
                  disabled={submitting}
                  autoComplete="off"
                />
                <span
                  className={`engage-open-count ${openRemaining <= 10 ? "engage-open-count-warn" : ""}`}
                >
                  {openRemaining}
                </span>
              </label>
              <button
                type="submit"
                className="btn btn-primary btn-sm engage-open-submit"
                disabled={submitting || !openText.trim()}
              >
                {submitting ? "Sending…" : "Submit"}
              </button>
            </form>
          ) : engagement.myText ? (
            <div className="engage-open-locked">
              <p className="engage-open-locked-label">Your answer</p>
              <p className="engage-open-locked-text">{engagement.myText}</p>
            </div>
          ) : null}

          {showTallies ? (
            sortedPhrases.length > 0 ? (
              <div className="engage-results">
                <p className="engage-results-label">Word cloud</p>
                <div className="engage-cloud" role="list">
                  {sortedPhrases.map((p, i) => {
                    const rank = p.count / maxPhraseCount;
                    const weight = Math.min(1.25, 0.92 + rank * 0.45);
                    return (
                      <span
                        key={p.text}
                        role="listitem"
                        className={[
                          "engage-chip",
                          i === 0 ? "engage-chip-top" : "",
                          rank >= 0.6 ? "engage-chip-strong" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{ fontSize: `${weight}rem` }}
                        title={`${p.count} response${p.count === 1 ? "" : "s"}`}
                      >
                        <span className="engage-chip-text">{p.text}</span>
                        <span className="engage-chip-count">{p.count}</span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="engage-hint">Waiting for answers…</p>
            )
          ) : resultsHint ? (
            <p className="engage-hint">{resultsHint}</p>
          ) : null}
        </div>
      )}
    </article>
  );
}
