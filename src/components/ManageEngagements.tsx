"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import { engagementTypeLabel } from "@/lib/engagement";
import type {
  EngagementDoc,
  EngagementResultsVisibility,
  EngagementType,
} from "@/lib/types";
import { downloadTextFile, engagementsToCsv } from "@/lib/utils";

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

function resetFormState() {
  return {
    type: "mcq" as EngagementType,
    prompt: "",
    options: ["", ""],
    resultsVisibility: "live" as EngagementResultsVisibility,
    durationSec: null as number | null,
    autoAdvance: false,
  };
}

export function ManageEngagements({ roomId }: { roomId: string }) {
  const [items, setItems] = useState<EngagementDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [type, setType] = useState<EngagementType>("mcq");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [resultsVisibility, setResultsVisibility] =
    useState<EngagementResultsVisibility>("live");
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<EngagementDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listEngagements({ roomId });
      setItems(res.engagements);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load engagements");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFormState = (next: ReturnType<typeof resetFormState>) => {
    setType(next.type);
    setPrompt(next.prompt);
    setOptions(next.options);
    setResultsVisibility(next.resultsVisibility);
    setDurationSec(next.durationSec);
    setAutoAdvance(next.autoAdvance);
  };

  const closeForm = () => {
    setComposeOpen(false);
    setEditingId(null);
    applyFormState(resetFormState());
  };

  const openCreate = () => {
    if (composeOpen && !editingId) {
      closeForm();
      return;
    }
    applyFormState(resetFormState());
    setEditingId(null);
    setComposeOpen(true);
  };

  const openEdit = (eng: EngagementDoc) => {
    if (eng.status !== "draft") return;
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
    setNotice(null);
    setError(null);
  };

  const saveDraft = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
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
        setNotice("Draft updated.");
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
        setNotice("Draft saved. Go live when you are ready.");
      }
      closeForm();
      await load();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : editingId
            ? "Could not update draft"
            : "Could not create draft",
      );
    } finally {
      setBusy(false);
    }
  };

  const goLive = async (engagementId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.goLiveEngagement({ roomId, engagementId });
      setNotice("Engagement is live. Share the room Engage tab with attendees.");
      if (editingId === engagementId) closeForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not go live");
    } finally {
      setBusy(false);
    }
  };

  const closeOne = async (engagementId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.closeEngagement({ roomId, engagementId });
      setNotice("Engagement closed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close");
    } finally {
      setBusy(false);
    }
  };

  const revealOne = async (engagementId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.revealEngagementResults({ roomId, engagementId });
      setNotice("Results revealed to attendees.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reveal");
    } finally {
      setBusy(false);
    }
  };

  const drafts = [...items]
    .filter((e) => e.status === "draft")
    .sort(
      (a, b) =>
        draftSortOrder(a) - draftSortOrder(b) ||
        a.createdAt - b.createdAt ||
        a.id.localeCompare(b.id),
    );

  const moveDraft = async (draftIndex: number, dir: -1 | 1) => {
    const a = drafts[draftIndex];
    const b = drafts[draftIndex + dir];
    if (!a || !b) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.swapEngagementOrder({
        roomId,
        aId: a.id,
        bId: b.id,
        aOrder: draftSortOrder(a),
        bOrder: draftSortOrder(b),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reorder");
    } finally {
      setBusy(false);
    }
  };

  const draftPosition = (id: string) => drafts.findIndex((d) => d.id === id);

  const openPresent = () => {
    window.open(`/rooms/${roomId}/present`, "_blank", "noopener");
  };

  const exportOne = async (engagementId: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.exportEngagements({ roomId, engagementId });
      downloadTextFile(
        `engagement-${engagementId}.csv`,
        engagementsToCsv(res.engagements),
      );
      setNotice("Engagement CSV downloaded.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.exportEngagements({ roomId });
      downloadTextFile(
        `${roomId}-engagements.csv`,
        engagementsToCsv(res.engagements),
      );
      setNotice(`Exported ${res.engagements.length} engagement(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
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
      if (editingId === deleteTarget.id) closeForm();
      setDeleteTarget(null);
      setNotice("Engagement deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Engagements
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
            Prep drafts here, then go live one at a time from Manage or the room
            Engage tab. Share your screen to show results.
          </p>
        </div>
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
            className="btn btn-outline btn-sm"
            disabled={busy || items.length === 0}
            onClick={() => void exportAll()}
          >
            Export all CSV
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
      </div>

      {error ? (
        <p className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-xl border border-[var(--ok-soft)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">
          {notice}
        </p>
      ) : null}

      {composeOpen ? (
        <form
          onSubmit={(e) => void saveDraft(e)}
          className="space-y-3 rounded-xl border border-[var(--line)] bg-[var(--surface-low)] p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--ink)]">
              {editingId ? "Edit draft" : "New draft"}
            </p>
            {editingId ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                disabled={busy}
                onClick={closeForm}
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
              required
              placeholder="What should people answer?"
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
                name="resultsVisibility"
                checked={resultsVisibility === "live"}
                onChange={() => setResultsVisibility("live")}
              />
              <span>
                <span className="font-semibold">After each person answers</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  Attendees see tallies after they answer; you always see them for
                  screen share
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name="resultsVisibility"
                checked={resultsVisibility === "after_close"}
                onChange={() => setResultsVisibility("after_close")}
              />
              <span>
                <span className="font-semibold">Hide until closed</span>
                <span className="mt-0.5 block text-xs text-[var(--ink-soft)]">
                  You still see tallies for screen share; attendees see them after
                  close
                </span>
              </span>
            </label>
          </fieldset>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={busy || !prompt.trim()}
          >
            {busy ? "Saving…" : editingId ? "Save changes" : "Save draft"}
          </button>
        </form>
      ) : null}

      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading engagements…</p>
      ) : null}

      {!loading && items.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">
          No engagements yet. Create a draft to preload polls before the session.
        </p>
      ) : null}

      <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
        {items.map((eng) => (
          <li
            key={eng.id}
            className="flex flex-wrap items-start justify-between gap-3 px-3 py-3"
          >
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                {eng.status === "draft" ? (
                  <span
                    className={`engage-queue-num ${draftPosition(eng.id) === 0 ? "engage-queue-num-next" : ""}`}
                    aria-hidden
                  >
                    {draftPosition(eng.id) + 1}
                  </span>
                ) : null}
                <span className="badge">
                  {eng.status === "live"
                    ? "Live"
                    : eng.status === "draft"
                      ? "Draft"
                      : "Closed"}
                </span>
                <span className="badge">
                  {engagementTypeLabel(eng.type)}
                </span>
                {durationLabel(eng.durationSec) ? (
                  <span className="badge">{durationLabel(eng.durationSec)}</span>
                ) : null}
                {eng.autoAdvance ? (
                  <span className="badge badge-gold">Auto</span>
                ) : null}
                <span className="badge">
                  {eng.resultsVisibility === "after_close"
                    ? "Hide until closed"
                    : "After each answers"}
                </span>
                <span className="badge">
                  {eng.responseCount} response
                  {eng.responseCount === 1 ? "" : "s"}
                </span>
              </div>
              <p className="text-sm font-semibold text-[var(--ink)] line-clamp-2">
                {eng.prompt}
              </p>
              {eng.type === "mcq" && eng.options.length > 0 ? (
                <ol className="mt-1.5 list-decimal space-y-0.5 pl-4 text-xs text-[var(--ink-soft)]">
                  {eng.options.map((opt) => (
                    <li key={opt.id}>{opt.label}</li>
                  ))}
                </ol>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {eng.status === "draft" ? (
                <>
                  <button
                    type="button"
                    className="engage-queue-move"
                    disabled={busy || draftPosition(eng.id) <= 0}
                    aria-label="Move up"
                    onClick={() => void moveDraft(draftPosition(eng.id), -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="engage-queue-move"
                    disabled={
                      busy || draftPosition(eng.id) >= drafts.length - 1
                    }
                    aria-label="Move down"
                    onClick={() => void moveDraft(draftPosition(eng.id), 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() => openEdit(eng)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy}
                    onClick={() => void goLive(eng.id)}
                  >
                    Go live
                  </button>
                </>
              ) : null}
              {eng.status === "live" ? (
                <>
                  {eng.resultsVisibility === "after_close" &&
                  !eng.resultsRevealed ? (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void revealOne(eng.id)}
                    >
                      Reveal
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    disabled={busy}
                    onClick={() => void closeOne(eng.id)}
                  >
                    Close
                  </button>
                </>
              ) : null}
              {eng.status !== "draft" ? (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => void exportOne(eng.id)}
                >
                  Export
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-outline btn-sm text-[var(--danger)]"
                disabled={busy}
                onClick={() => setDeleteTarget(eng)}
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this engagement?"
        description={
          deleteTarget ? (
            <>
              <p className="mb-2 font-medium line-clamp-2">
                “{deleteTarget.prompt}”
              </p>
              <p>Responses and results will be removed.</p>
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
    </section>
  );
}
