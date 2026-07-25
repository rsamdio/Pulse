"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { AccessBadge } from "@/components/AccessBadge";
import { api } from "@/lib/api";
import type { AdminPerson, AdminRoomSummary } from "@/lib/types";

function AdminConsole() {
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [organizers, setOrganizers] = useState<AdminPerson[]>([]);
  const [admins, setAdmins] = useState<AdminPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [promoteEmail, setPromoteEmail] = useState("");
  const [demoteTarget, setDemoteTarget] = useState<AdminPerson | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminRoomSummary | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAdminDashboard();
      setRooms(res.rooms);
      setOrganizers(res.organizers);
      setAdmins(res.admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .listAdminDashboard()
      .then((res) => {
        if (cancelled) return;
        setRooms(res.rooms);
        setOrganizers(res.organizers);
        setAdmins(res.admins);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Failed to load admin data",
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function promote(e: React.FormEvent) {
    e.preventDefault();
    const email = promoteEmail.trim();
    if (!email) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.promoteUser({ email });
      setPromoteEmail("");
      setNotice(`Promoted ${email} to organizer.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Promote failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDemote() {
    if (!demoteTarget) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.demoteUser({ uid: demoteTarget.uid });
      setNotice(`Demoted ${demoteTarget.email || demoteTarget.displayName}.`);
      setDemoteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demote failed");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDeleteRoom() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.deleteRoom({ roomId: deleteTarget.id });
      setNotice(`Deleted room “${deleteTarget.title}”.`);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
      <div>
        <p className="label-caps text-[var(--primary-deep)]">Super admin</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
          Admin console
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--ink-soft)]">
          Promote organizers, review every room, and jump into Open or Manage
          for Q&A and Engage. Room-level questions, votes, and engagements stay
          on each room page.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading…</p>
      ) : null}
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

      <section className="panel space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              Organizers
            </h2>
            <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
              Only you can promote or demote. Super admins cannot be demoted
              here.
            </p>
          </div>
        </div>

        {admins.length > 0 ? (
          <div className="space-y-2">
            <p className="label-caps">Super admins</p>
            <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
              {admins.map((person) => (
                <li
                  key={person.uid}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--ink)]">
                      {person.displayName || "Admin"}
                    </p>
                    <p className="text-xs text-[var(--ink-muted)]">
                      {person.email}
                    </p>
                  </div>
                  <span className="badge badge-pink">Admin</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <form onSubmit={(e) => void promote(e)} className="flex flex-wrap gap-2">
          <input
            type="email"
            className="field min-w-[16rem] flex-1"
            placeholder="email@example.com"
            value={promoteEmail}
            onChange={(e) => setPromoteEmail(e.target.value)}
            disabled={busy}
            required
          />
          <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
            Promote to organizer
          </button>
        </form>

        {organizers.length === 0 ? (
          <p className="text-sm text-[var(--ink-muted)]">
            No organizers yet. Promote someone who has already signed in.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
            {organizers.map((person) => (
              <li
                key={person.uid}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">
                    {person.displayName || "Organizer"}
                  </p>
                  <p className="text-xs text-[var(--ink-muted)]">{person.email}</p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => setDemoteTarget(person)}
                >
                  Demote
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            All rooms
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ink-soft)]">
            Open a room for live questions and votes, or manage access and
            flags.
          </p>
        </div>

        {!loading && rooms.length === 0 ? (
          <div className="panel text-center">
            <p className="text-sm text-[var(--ink-soft)]">No rooms yet.</p>
          </div>
        ) : null}

        <div className="grid gap-3">
          {rooms.map((room) => (
            <article key={room.id} className="panel !p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <AccessBadge mode={room.accessMode} variant="room" />
                    {room.anonymous ? (
                      <span className="badge badge-gold">Anonymous</span>
                    ) : null}
                    {room.questionsLocked ? (
                      <span className="badge">Locked</span>
                    ) : null}
                    {room.viewOnly ? (
                      <span className="badge">View only</span>
                    ) : null}
                  </div>
                  <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--ink)]">
                    {room.title}
                  </h3>
                  <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                    /{room.slug}
                    {room.organizerEmail
                      ? ` · ${room.organizerName || room.organizerEmail}`
                      : ""}
                  </p>
                  <p className="mt-2 text-sm text-[var(--ink-soft)]">
                    {room.questionCount} questions · {room.voteTotal} votes ·{" "}
                    {room.memberCount} members
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/rooms/${room.id}`}
                    className="btn btn-primary btn-sm"
                  >
                    Open room
                  </Link>
                  <Link
                    href={`/rooms/${room.id}/manage`}
                    className="btn btn-outline btn-sm"
                  >
                    Manage
                  </Link>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm text-[var(--danger)]"
                    disabled={busy}
                    onClick={() => setDeleteTarget(room)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={Boolean(demoteTarget)}
        title="Demote organizer?"
        description={
          demoteTarget ? (
            <p>
              {demoteTarget.displayName || demoteTarget.email} will become an
              attendee and can no longer create rooms.
            </p>
          ) : null
        }
        confirmLabel="Demote"
        danger
        busy={busy}
        onCancel={() => {
          if (!busy) setDemoteTarget(null);
        }}
        onConfirm={() => void confirmDemote()}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this room?"
        description={
          deleteTarget ? (
            <>
              <p className="mb-2 font-medium text-ink line-clamp-2">
                “{deleteTarget.title}”
              </p>
              <p>
                Removes questions, votes, invite list, and entry code for
                everyone. This cannot be undone.
              </p>
            </>
          ) : null
        }
        confirmLabel="Delete room"
        cancelLabel="Keep room"
        danger
        busy={busy}
        onCancel={() => {
          if (!busy) setDeleteTarget(null);
        }}
        onConfirm={() => void confirmDeleteRoom()}
      />
    </div>
  );
}

export default function AdminPage() {
  return (
    <RequireAuth adminOnly>
      <AdminConsole />
    </RequireAuth>
  );
}
