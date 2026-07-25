"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EngageCountdown } from "@/components/EngageCountdown";
import { api } from "@/lib/api";
import { engagementTypeLabel, isFreeTextEngagement } from "@/lib/engagement";
import { useEngagementExpiry } from "@/lib/hooks/useEngagementExpiry";
import { layoutWordCloud } from "@/lib/wordCloudLayout";
import type {
  DraftQueueEntry,
  EngageControlRtdb,
  EngagementDoc,
  EngagementResultsVisibility,
  EngagementType,
  EngagementView,
  PrivateEngagementResult,
} from "@/lib/types";

const DURATION_PRESETS: { label: string; value: number | null }[] = [
  { label: "No timer", value: null },
  { label: "15 sec", value: 15 },
  { label: "30 sec", value: 30 },
  { label: "45 sec", value: 45 },
  { label: "1 min", value: 60 },
  { label: "90 sec", value: 90 },
  { label: "2 min", value: 120 },
  { label: "5 min", value: 300 },
];

function durationLabel(sec: number | null | undefined): string | null {
  if (sec == null) return null;
  if (sec % 60 === 0) return `${sec / 60} min`;
  return `${sec} sec`;
}

function draftSortOrder(d: EngagementDoc): number {
  return typeof d.sortOrder === "number" ? d.sortOrder : d.createdAt;
}

export function EngagementPane({
  roomId,
  engagements,
  live,
  isOrganizer,
  canRespond,
  loading,
  privateResults = {},
  draftQueue = null,
  control = null,
  serverOffset = 0,
}: {
  roomId: string;
  engagements: EngagementView[];
  live: EngagementView | null;
  isOrganizer: boolean;
  canRespond: boolean;
  loading: boolean;
  privateResults?: Record<string, PrivateEngagementResult>;
  draftQueue?: Record<string, DraftQueueEntry> | null;
  control?: EngageControlRtdb | null;
  serverOffset?: number;
}) {
  const [drafts, setDrafts] = useState<EngagementDoc[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<EngagementType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [resultsVisibility, setResultsVisibility] =
    useState<EngagementResultsVisibility>("live");
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peekOpen, setPeekOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    EngagementView | EngagementDoc | null
  >(null);
  const [deleting, setDeleting] = useState(false);
  const [skipTarget, setSkipTarget] = useState<EngagementDoc | null>(null);
  const [closeConfirm, setCloseConfirm] = useState(false);

  // Host backstop: fire expiry / grace completion when timers elapse.
  useEngagementExpiry({
    roomId,
    enabled: isOrganizer,
    phase: control?.phase,
    generation: control?.generation,
    advanceAt: control?.advanceAt ?? null,
    liveEndsAt: live?.liveEndsAt ?? null,
    serverOffset,
  });

  const resetCompose = () => {
    setEditingId(null);
    setType("mcq");
    setPrompt("");
    setOptions(["", ""]);
    setResultsVisibility("live");
    setDurationSec(null);
    setAutoAdvance(false);
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

  // Reload drafts when the mirrored draft queue changes (not on countdown ticks).
  const draftSignature = draftQueue
    ? Object.entries(draftQueue)
        .map(([id, e]) => `${id}:${e.sortOrder}`)
        .sort()
        .join("|")
    : "";

  useEffect(() => {
    void loadDrafts();
  }, [loadDrafts, draftSignature]);

  const openCreate = () => {
    if (composeOpen && !editingId) {
      resetCompose();
      return;
    }
    resetCompose();
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
    setDurationSec(eng.durationSec ?? null);
    setAutoAdvance(Boolean(eng.autoAdvance));
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
      const nextAuto = durationSec != null && autoAdvance;
      if (editingId) {
        await api.updateEngagement({
          roomId,
          engagementId: editingId,
          prompt: prompt.trim(),
          options: optionLabels,
          resultsVisibility,
          durationSec,
          autoAdvance: nextAuto,
        });
      } else {
        await api.createEngagement({
          roomId,
          type,
          prompt: prompt.trim(),
          options: optionLabels,
          resultsVisibility,
          durationSec,
          autoAdvance: nextAuto,
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
      setSkipTarget(null);
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
      setCloseConfirm(false);
    }
  };

  const requestClose = () => {
    if (live?.autoAdvance && drafts.length > 0) {
      setCloseConfirm(true);
    } else {
      void closeLive();
    }
  };

  const revealResults = async () => {
    if (!live) return;
    setBusy(true);
    setError(null);
    try {
      await api.revealEngagementResults({ roomId, engagementId: live.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reveal");
    } finally {
      setBusy(false);
    }
  };

  const startNext = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.advanceEngagement({ roomId, fromEngagementId: live?.id });
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start next");
    } finally {
      setBusy(false);
    }
  };

  const cancelNext = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.cancelNextEngagement({ roomId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteEngagement({ roomId, engagementId: deleteTarget.id });
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

  const sortedDrafts = useMemo(
    () =>
      [...drafts].sort(
        (a, b) =>
          draftSortOrder(a) - draftSortOrder(b) ||
          a.createdAt - b.createdAt ||
          a.id.localeCompare(b.id),
      ),
    [drafts],
  );

  const moveDraft = async (index: number, dir: -1 | 1) => {
    const a = sortedDrafts[index];
    const b = sortedDrafts[index + dir];
    if (!a || !b) return;
    setBusy(true);
    setError(null);
    try {
      await api.swapEngagementOrder({
        roomId,
        aId: a.id,
        bId: b.id,
        aOrder: draftSortOrder(a),
        bOrder: draftSortOrder(b),
      });
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder");
    } finally {
      setBusy(false);
    }
  };

  const requestGoLive = (draft: EngagementDoc, index: number) => {
    if (index > 0) setSkipTarget(draft);
    else void goLive(draft.id);
  };

  const phase = control?.phase ?? "idle";
  const showStartNext = isOrganizer && sortedDrafts.length > 0;
  const reservedPrompt =
    control?.reservedNextId && draftQueue?.[control.reservedNextId]
      ? draftQueue[control.reservedNextId].prompt
      : null;

  const openPresent = () => {
    window.open(`/rooms/${roomId}/present`, "_blank", "noopener");
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
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={openPresent}
            >
              Open present view
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={openCreate}
            >
              {composeOpen && !editingId ? "Cancel" : "New draft"}
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {isOrganizer && phase === "grace" ? (
        <div className="engage-grace-banner" role="status" aria-live="polite">
          <div className="min-w-0">
            <p className="engage-grace-title">
              Next prompt starting in{" "}
              <EngageCountdown
                liveEndsAt={control?.advanceAt ?? null}
                serverOffset={serverOffset}
                warningUnderSec={4}
              />
            </p>
            {reservedPrompt ? (
              <p className="engage-grace-sub line-clamp-1">{reservedPrompt}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline btn-sm"
              disabled={busy}
              onClick={() => void cancelNext()}
            >
              Cancel next
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy}
              onClick={() => void startNext()}
            >
              Start now
            </button>
          </div>
        </div>
      ) : null}

      {isOrganizer && phase === "held" && sortedDrafts.length > 0 ? (
        <div className="engage-grace-banner" role="status">
          <p className="engage-grace-title">Auto-advance paused</p>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy}
            onClick={() => void startNext()}
          >
            Start next
          </button>
        </div>
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
                className={`mode-card flex-1 text-left ${type === "word_cloud" ? "mode-card-on" : ""}`}
                onClick={() => setType("word_cloud")}
              >
                <span className="font-semibold">Word cloud</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  One or two words; live cloud
                </span>
              </button>
              <button
                type="button"
                className={`mode-card flex-1 text-left ${type === "open_text" ? "mode-card-on" : ""}`}
                onClick={() => setType("open_text")}
              >
                <span className="font-semibold">Short answers</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  Short written answers; grouped feed
                </span>
              </button>
            </div>
          ) : (
            <p className="text-xs text-[var(--ink-muted)]">
              {engagementTypeLabel(type)} (type cannot be changed)
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
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="label-caps">Timer</span>
              <select
                className="field"
                value={durationSec == null ? "" : String(durationSec)}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = v === "" ? null : Number(v);
                  setDurationSec(next);
                  if (next == null) setAutoAdvance(false);
                }}
              >
                {DURATION_PRESETS.map((p) => (
                  <option
                    key={p.label}
                    value={p.value == null ? "" : String(p.value)}
                  >
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input
                type="checkbox"
                checked={autoAdvance}
                disabled={durationSec == null}
                onChange={(e) => setAutoAdvance(e.target.checked)}
              />
              <span
                className={durationSec == null ? "text-[var(--ink-muted)]" : ""}
              >
                Auto-advance to next draft when time is up
              </span>
            </label>
          </div>
          <fieldset className="space-y-2">
            <legend className="label-caps">Results</legend>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="pane-results-visibility"
                checked={resultsVisibility === "live"}
                onChange={() => setResultsVisibility("live")}
              />
              <span>
                <span className="font-semibold">After each person answers</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  Attendees see tallies once they answer; you always see them
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="pane-results-visibility"
                checked={resultsVisibility === "after_close"}
                onChange={() => setResultsVisibility("after_close")}
              />
              <span>
                <span className="font-semibold">Hide until closed</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  Attendees see results after close; you can Peek anytime
                </span>
              </span>
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

      {isOrganizer && sortedDrafts.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label-caps">Up next queue</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => void startNext()}
            >
              {live ? "Close & start next" : "Start next"}
            </button>
          </div>
          {sortedDrafts.map((d, index) => (
            <div key={d.id} className="engage-draft-row">
              <span
                className={`engage-queue-num ${index === 0 ? "engage-queue-num-next" : ""}`}
                aria-hidden
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold line-clamp-2">{d.prompt}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {index === 0 ? (
                    <span className="badge badge-live">Up next</span>
                  ) : null}
                  <span className="badge">{engagementTypeLabel(d.type)}</span>
                  {durationLabel(d.durationSec) ? (
                    <span className="badge">{durationLabel(d.durationSec)}</span>
                  ) : null}
                  {d.autoAdvance ? (
                    <span className="badge badge-gold">Auto</span>
                  ) : null}
                  <span className="badge">
                    {d.resultsVisibility === "after_close"
                      ? "Hide until closed"
                      : "Live results"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  className="engage-queue-move"
                  disabled={busy || index === 0}
                  aria-label="Move up"
                  onClick={() => void moveDraft(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="engage-queue-move"
                  disabled={busy || index === sortedDrafts.length - 1}
                  aria-label="Move down"
                  onClick={() => void moveDraft(index, 1)}
                >
                  ↓
                </button>
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
                  onClick={() => requestGoLive(d, index)}
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

      {!loading && engagements.length === 0 && sortedDrafts.length === 0 ? (
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
            serverOffset={serverOffset}
            privateResult={privateResults[eng.id]}
            peekOpen={peekOpen}
            showStartNext={showStartNext}
            onClose={eng.status === "live" ? requestClose : undefined}
            onReveal={eng.status === "live" ? () => void revealResults() : undefined}
            onTogglePeek={() => setPeekOpen((v) => !v)}
            onStartNext={() => void startNext()}
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

      <ConfirmDialog
        open={Boolean(skipTarget)}
        title="Skip ahead in the queue?"
        description={
          skipTarget ? (
            <>
              <p className="mb-2 font-medium line-clamp-2">
                “{skipTarget.prompt}”
              </p>
              <p>
                This draft is not first in the queue. Going live now skips the
                ones ahead of it (they stay as drafts).
              </p>
            </>
          ) : null
        }
        confirmLabel="Go live"
        cancelLabel="Keep order"
        busy={busy}
        onCancel={() => {
          if (!busy) setSkipTarget(null);
        }}
        onConfirm={() => {
          if (skipTarget) void goLive(skipTarget.id);
        }}
      />

      <ConfirmDialog
        open={closeConfirm}
        title="Close this prompt now?"
        description={
          <p>
            This prompt is set to auto-advance. Closing now stops the timer and
            keeps the room on its results instead of moving on.
          </p>
        }
        confirmLabel="Close now"
        cancelLabel="Keep live"
        busy={busy}
        onCancel={() => {
          if (!busy) setCloseConfirm(false);
        }}
        onConfirm={() => void closeLive()}
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
  serverOffset,
  privateResult,
  peekOpen,
  showStartNext,
  onClose,
  onReveal,
  onTogglePeek,
  onStartNext,
  onDelete,
  onError,
}: {
  roomId: string;
  engagement: EngagementView;
  isOrganizer: boolean;
  canRespond: boolean;
  busy: boolean;
  serverOffset: number;
  privateResult?: PrivateEngagementResult;
  peekOpen: boolean;
  showStartNext: boolean;
  onClose?: () => void;
  onReveal?: () => void;
  onTogglePeek?: () => void;
  onStartNext?: () => void;
  onDelete: () => void;
  onError: (msg: string | null) => void;
}) {
  const [openText, setOpenText] = useState(engagement.myText ?? "");
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    engagement.myOptionId ?? null,
  );
  const [submitting, setSubmitting] = useState(false);

  const isLive = engagement.status === "live";
  const closed = engagement.status === "closed";
  const revealed = Boolean(engagement.resultsRevealed) || closed;
  const hasAnswered = Boolean(engagement.myOptionId || engagement.myText);
  const canAnswer = isLive && canRespond && !hasAnswered;
  const visibility = engagement.resultsVisibility ?? "live";

  const canPeek =
    isOrganizer && isLive && visibility === "after_close" && !revealed;
  const peeking = canPeek && peekOpen;
  // Private stream can lag; never paint empty public tallies as 0% Peek.
  const peekReady = Boolean(privateResult);

  const showTallies =
    visibility === "live"
      ? isOrganizer || hasAnswered || closed
      : revealed || (isOrganizer && peekOpen && peekReady);

  // When peeking, use private tallies only (no public fallback).
  const effOptionCounts = peeking
    ? (privateResult?.optionCounts ?? {})
    : (engagement.optionCounts ?? {});
  const effPhrases = peeking
    ? (privateResult?.phrases ?? [])
    : (engagement.phrases ?? []);

  const total = Math.max(1, engagement.responseCount);

  const resultsHint = (() => {
    if (showTallies || !isLive) return null;
    if (visibility === "after_close") {
      if (isOrganizer) return "Results hidden from attendees until you reveal or close. Peek to preview.";
      return hasAnswered
        ? "Results appear when the host closes this prompt."
        : null;
    }
    if (!hasAnswered) return "Answer to see live results.";
    return null;
  })();

  useEffect(() => {
    if (engagement.myText != null) setOpenText(engagement.myText);
  }, [engagement.myText]);

  useEffect(() => {
    if (engagement.myOptionId) setSelectedOptionId(engagement.myOptionId);
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

  const sortedPhrases = useMemo(
    () =>
      [...effPhrases].sort(
        (a, b) => b.count - a.count || a.text.localeCompare(b.text),
      ),
    [effPhrases],
  );
  const cloudItems = useMemo(
    () =>
      engagement.type === "word_cloud" ? layoutWordCloud(sortedPhrases) : [],
    [engagement.type, sortedPhrases],
  );
  const openRemaining = 60 - openText.length;
  const freeTextPlaceholder =
    engagement.type === "word_cloud"
      ? "Type a word or two…"
      : "Type your answer…";

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
          <div className="flex flex-wrap items-center gap-1.5">
            {isLive ? (
              <span className="badge badge-live">Live</span>
            ) : (
              <span className="badge">Closed</span>
            )}
            {isLive && engagement.liveEndsAt != null ? (
              <EngageCountdown
                liveEndsAt={engagement.liveEndsAt}
                serverOffset={serverOffset}
              />
            ) : null}
            {hasAnswered ? (
              <span className="badge badge-green">Answered</span>
            ) : null}
            <span className="badge">
              {engagementTypeLabel(engagement.type)}
            </span>
            {isOrganizer && visibility === "after_close" ? (
              <span className="badge">Hide until closed</span>
            ) : null}
            {isOrganizer && engagement.autoAdvance ? (
              <span className="badge badge-gold">Auto</span>
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
          <div className="flex flex-wrap justify-end gap-2">
            {onClose ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || submitting}
                onClick={onClose}
              >
                Close
              </button>
            ) : null}
            {canPeek && onReveal ? (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy || submitting}
                onClick={onReveal}
              >
                Reveal
              </button>
            ) : null}
            {canPeek && onTogglePeek ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy || submitting}
                onClick={onTogglePeek}
              >
                {peekOpen ? "Hide peek" : "Peek"}
              </button>
            ) : null}
            {isLive && showStartNext && onStartNext ? (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={busy || submitting}
                onClick={onStartNext}
              >
                Start next
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

      {peeking ? (
        <p className="engage-peek-banner" role="status">
          {peekReady
            ? "Peeking at live results. Attendees can’t see these until you reveal or close."
            : "Loading peek…"}
        </p>
      ) : null}

      {engagement.type === "mcq" ? (
        <div className="engage-options" role="radiogroup" aria-label="Choices">
          {(engagement.options ?? []).map((opt, index) => {
            const count = Number(effOptionCounts[opt.id] ?? 0);
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
      ) : isFreeTextEngagement(engagement.type) ? (
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
                  placeholder={freeTextPlaceholder}
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
              engagement.type === "word_cloud" ? (
                <div className="engage-results">
                  <p className="engage-results-label">Word cloud</p>
                  <div
                    className="engage-cloud-scatter"
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
                          fontSize: `${item.fontSize}rem`,
                        }}
                        title={`${item.count} response${item.count === 1 ? "" : "s"}`}
                      >
                        {item.text}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="engage-results">
                  <p className="engage-results-label">Answers</p>
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
              )
            ) : (
              <p className="engage-hint">Waiting for answers…</p>
            )
          ) : resultsHint ? (
            <p className="engage-hint">{resultsHint}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
