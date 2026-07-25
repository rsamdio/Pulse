"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import type {
  EngagementDoc,
  EngagementResultsVisibility,
  EngagementType,
} from "@/lib/types";
import { downloadTextFile, engagementsToCsv } from "@/lib/utils";

function resetFormState() {
  return {
    type: "mcq" as EngagementType,
    prompt: "",
    options: ["", ""],
    resultsVisibility: "live" as EngagementResultsVisibility,
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

  const closeForm = () => {
    setComposeOpen(false);
    setEditingId(null);
    const next = resetFormState();
    setType(next.type);
    setPrompt(next.prompt);
    setOptions(next.options);
    setResultsVisibility(next.resultsVisibility);
  };

  const openCreate = () => {
    if (composeOpen && !editingId) {
      closeForm();
      return;
    }
    const next = resetFormState();
    setType(next.type);
    setPrompt(next.prompt);
    setOptions(next.options);
    setResultsVisibility(next.resultsVisibility);
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
      if (editingId) {
        await api.updateEngagement({
          roomId,
          engagementId: editingId,
          prompt: prompt.trim(),
          options: optionLabels,
          resultsVisibility,
        });
        setNotice("Draft updated.");
      } else {
        await api.createEngagement({
          roomId,
          type,
          prompt: prompt.trim(),
          options: optionLabels,
          resultsVisibility,
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
              </button>
              <button
                type="button"
                className={`mode-card flex-1 text-left ${type === "open" ? "mode-card-on" : ""}`}
                onClick={() => setType("open")}
              >
                <span className="font-semibold">Open text</span>
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
              <div className="mb-1 flex flex-wrap gap-1.5">
                <span className="badge">
                  {eng.status === "live"
                    ? "Live"
                    : eng.status === "draft"
                      ? "Draft"
                      : "Closed"}
                </span>
                <span className="badge">
                  {eng.type === "mcq" ? "Multiple choice" : "Open text"}
                </span>
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
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => void closeOne(eng.id)}
                >
                  Close
                </button>
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
