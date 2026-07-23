"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { AccessBadge } from "@/components/AccessBadge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import type { AccessMode, RoomDoc } from "@/lib/types";
import { downloadTextFile, questionsToCsv } from "@/lib/utils";

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

const ACCESS_MODES: { id: AccessMode; label: string; hint: string }[] = [
  {
    id: "public",
    label: "Open",
    hint: "Anyone signed in can join with the link.",
  },
  {
    id: "join_code",
    label: "Entry code",
    hint: "Participants must enter the 6-digit code.",
  },
  {
    id: "allowlist",
    label: "Invite list",
    hint: "Only pre-approved email addresses.",
  },
  {
    id: "hybrid",
    label: "Invite or code",
    hint: "Invites bypass the code; others use it.",
  },
];

function ManageRoom() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();
  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [emails, setEmails] = useState("");
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [codeVisible, setCodeVisible] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const roomPath = `/rooms/${roomId}`;

  const load = useCallback(async () => {
    setError(null);
    try {
      const access = await api.getRoomAccess({ roomId });
      if (!access.isOrganizer || !access.room) {
        setError("Only the organizer can manage this room.");
        return;
      }
      setRoom(access.room);

      const mode = access.room.accessMode;
      const needsAllowlist = mode === "allowlist" || mode === "hybrid";
      const needsCode = mode === "join_code" || mode === "hybrid";

      const [list, codeRes] = await Promise.all([
        needsAllowlist
          ? api.getAllowlist({ roomId })
          : Promise.resolve({ emails: [] as string[] }),
        needsCode
          ? api.getJoinCode({ roomId })
          : Promise.resolve({ joinCode: null as string | null }),
      ]);

      if (needsAllowlist) setEmails(list.emails.join("\n"));
      else setEmails("");

      if (needsCode) setJoinCode(codeRes.joinCode);
      else setJoinCode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchFlags = async (patch: {
    questionsLocked?: boolean;
    viewOnly?: boolean;
    anonymous?: boolean;
    accessMode?: AccessMode;
  }) => {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const res = await api.updateRoomFlags({ roomId, ...patch });
      setRoom((prev) => (prev ? { ...prev, ...patch } : prev));
      if (patch.accessMode === "join_code" || patch.accessMode === "hybrid") {
        if (res.joinCode) setJoinCode(res.joinCode);
        else {
          const codeRes = await api.getJoinCode({ roomId });
          setJoinCode(codeRes.joinCode);
        }
      } else if (patch.accessMode) {
        setJoinCode(null);
      }
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const saveAllowlist = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const list = emails
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.setAllowlist({ roomId, emails: list });
      setMessage(`Allowlist updated (${res.count} emails)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Allowlist update failed");
    } finally {
      setBusy(false);
    }
  };

  const rotateCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.rotateJoinCode({ roomId });
      setJoinCode(res.joinCode);
      setCodeVisible(true);
      setMessage("Entry code rotated. Old code no longer works.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rotate code");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.exportQuestions({ roomId });
      const csv = questionsToCsv(res.questions);
      downloadTextFile(`${room?.title ?? "room"}-questions.csv`, csv);
      setMessage(`Exported ${res.questions.length} questions`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const deleteRoom = async () => {
    setDeleting(true);
    setError(null);
    try {
      await api.deleteRoom({ roomId });
      router.replace("/rooms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete room");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  if (error && !room) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] p-5 text-sm text-[var(--danger)]">
        {error}
      </div>
    );
  }

  if (!room) {
    return (
      <p className="mt-16 text-center text-sm text-[var(--ink-muted)]">
        Loading manage panel…
      </p>
    );
  }

  const usesCode =
    room.accessMode === "join_code" || room.accessMode === "hybrid";

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1.5 flex flex-wrap gap-1.5">
            <AccessBadge mode={room.accessMode} variant="policy" />
            {room.anonymous ? (
              <span className="badge badge-gold">Anonymous</span>
            ) : null}
            <span className="badge badge-live">Manage</span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Broadcast control
          </h1>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">{room.title}</p>
          <p className="mt-1 max-w-xl text-sm text-[var(--ink-muted)]">
            Manage participant access, room state, and share settings.
          </p>
        </div>
        <Link href={`/rooms/${roomId}`} className="btn btn-secondary btn-sm">
          Open room
        </Link>
      </div>

      <section className="panel space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Share access
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <code className="min-w-0 flex-1 truncate rounded-xl border border-[var(--line)] bg-[var(--surface-low)] px-3 py-2.5 font-mono text-xs text-[var(--secondary)]">
            {roomPath}
          </code>
          <button
            type="button"
            className="btn btn-outline btn-sm shrink-0"
            onClick={() =>
              void copyText(`${window.location.origin}${roomPath}`).then(
                (ok) =>
                  setMessage(ok ? "Room link copied" : "Could not copy link"),
              )
            }
          >
            Copy link
          </button>
        </div>

        {usesCode ? (
          <div className="rounded-xl border border-[var(--line)] bg-[var(--surface-low)] p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="label-caps">6-digit entry code</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--secondary)] underline"
                  onClick={() => setCodeVisible((v) => !v)}
                >
                  {codeVisible ? "Hide" : "Show"}
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-[var(--primary-deep)] underline"
                  disabled={busy}
                  onClick={() => void rotateCode()}
                >
                  Rotate
                </button>
              </div>
            </div>
            <p className="code-display">
              {joinCode
                ? codeVisible
                  ? `${joinCode.slice(0, 3)} ${joinCode.slice(3)}`
                  : "••• •••"
                : "······"}
            </p>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!joinCode || busy}
              onClick={() =>
                void copyText(joinCode ?? "").then((ok) =>
                  setMessage(ok ? "Entry code copied" : "Could not copy code"),
                )
              }
            >
              Copy code
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Access mode
        </h2>
        <div className="mode-grid">
          {ACCESS_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`mode-card ${
                room.accessMode === mode.id ? "mode-card-on" : ""
              }`}
              disabled={busy}
              onClick={() => void patchFlags({ accessMode: mode.id })}
            >
              <div className="text-sm font-semibold">{mode.label}</div>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">{mode.hint}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="panel space-y-3">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Room state
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            className={`mode-card ${room.questionsLocked ? "mode-card-on" : ""}`}
            disabled={busy}
            onClick={() =>
              void patchFlags({ questionsLocked: !room.questionsLocked })
            }
          >
            <div className="text-sm font-semibold">Lock new questions</div>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              {room.questionsLocked ? "Currently locked" : "Currently open"}
            </p>
          </button>
          <button
            type="button"
            className={`mode-card ${room.viewOnly ? "mode-card-on" : ""}`}
            disabled={busy}
            onClick={() => void patchFlags({ viewOnly: !room.viewOnly })}
          >
            <div className="text-sm font-semibold">View-only mode</div>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              Disable voting and new questions for attendees
            </p>
          </button>
          <button
            type="button"
            className={`mode-card ${room.anonymous ? "mode-card-on" : ""}`}
            disabled={busy}
            onClick={() =>
              void patchFlags({ anonymous: !Boolean(room.anonymous) })
            }
          >
            <div className="text-sm font-semibold">Anonymous room</div>
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              {room.anonymous
                ? "Authors are hidden as Anonymous"
                : "Show real names on questions"}
            </p>
          </button>
        </div>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={() => void exportCsv()}
        >
          Export Q&A CSV
        </button>
      </section>

      {(room.accessMode === "allowlist" || room.accessMode === "hybrid") && (
        <form onSubmit={(e) => void saveAllowlist(e)} className="panel space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Invite list
          </h2>
          <textarea
            className="field min-h-32 font-mono text-sm"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="one email per line"
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            Save invite list
          </button>
        </form>
      )}

      {message ? (
        <p className="rounded-xl border border-[var(--ok-soft)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <section className="panel space-y-3 border-[var(--danger-soft)]">
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--danger)]">
          Delete room
        </h2>
        <p className="text-sm text-[var(--ink-soft)]">
          Permanently removes this room, its questions, votes, invite list, and
          entry code. This cannot be undone.
        </p>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={busy || deleting}
          onClick={() => setDeleteOpen(true)}
        >
          Delete this room
        </button>
      </section>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete this room?"
        description={
          <>
            <p className="mb-2 font-medium text-ink line-clamp-2">
              “{room.title}”
            </p>
            <p>
              Everything tied to this room will be removed for everyone:
              questions, votes, invite list, and entry code.
            </p>
          </>
        }
        confirmLabel="Delete room"
        cancelLabel="Keep room"
        danger
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        onConfirm={() => void deleteRoom()}
      />
    </div>
  );
}

export default function ManagePage() {
  return (
    <RequireAuth>
      <ManageRoom />
    </RequireAuth>
  );
}
