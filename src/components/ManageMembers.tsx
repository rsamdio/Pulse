"use client";

import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api } from "@/lib/api";
import type { AccessMode, RoomMemberRow, RoomMemberVia } from "@/lib/types";
import { downloadTextFile, membersToCsv } from "@/lib/utils";

function viaLabel(via: RoomMemberVia): string {
  switch (via) {
    case "allowlist":
      return "Invite list";
    case "code":
      return "Entry code";
    case "organizer":
      return "Host";
    case "public":
      return "Open link";
    default: {
      const _exhaustive: never = via;
      return _exhaustive;
    }
  }
}

function matchesQuery(member: RoomMemberRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    member.displayName.toLowerCase().includes(q) ||
    member.email.toLowerCase().includes(q) ||
    viaLabel(member.via).toLowerCase().includes(q)
  );
}

export function ManageMembers({
  roomId,
  accessMode,
}: {
  roomId: string;
  accessMode: AccessMode;
}) {
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<RoomMemberRow | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listRoomMembers({ roomId });
      setMembers(res.members);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load people");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = members.filter((m) => matchesQuery(m, query));

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    setError(null);
    setNotice(null);
    try {
      await api.removeRoomMember({
        roomId,
        memberUid: removeTarget.uid,
      });
      setNotice(
        `${removeTarget.displayName} was removed. They can rejoin with the entry code if you still share it.`,
      );
      setRemoveTarget(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove");
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  };

  const exportCsv = () => {
    setError(null);
    downloadTextFile(`${roomId}-members.csv`, membersToCsv(members));
    setNotice(`Exported ${members.length} member(s).`);
  };

  const hint =
    accessMode === "allowlist"
      ? "Invite-list guests can return while still on the invite list. Remove their email there to keep them out."
      : accessMode === "hybrid"
        ? "Code joiners must enter the code again. Invite-list guests can return while still on the invite list."
        : accessMode === "join_code"
          ? "Removed people must enter the entry code again to rejoin."
          : "Open rooms do not sticky-track every visitor. People listed here have an active membership record.";

  return (
    <section className="panel space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            People in this room
          </h2>
          <p className="mt-0.5 text-sm text-[var(--ink-soft)]">{hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy || loading || members.length === 0}
            onClick={exportCsv}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy || loading}
            onClick={() => {
              setBusy(true);
              void load().finally(() => setBusy(false));
            }}
          >
            Refresh
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

      {loading ? (
        <p className="text-sm text-[var(--ink-muted)]">Loading people…</p>
      ) : null}

      {!loading && members.length === 0 ? (
        <p className="text-sm text-[var(--ink-muted)]">
          No members recorded yet.
        </p>
      ) : null}

      {!loading && members.length > 0 ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="min-w-0 flex-1">
              <span className="sr-only">Search people</span>
              <input
                className="field"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or email"
                autoComplete="off"
              />
            </label>
            <p className="shrink-0 text-xs text-[var(--ink-muted)]">
              {query.trim()
                ? `${filtered.length} of ${members.length}`
                : `${members.length} people`}
            </p>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-xl border border-[var(--line)] px-3 py-4 text-sm text-[var(--ink-muted)]">
              No matches for “{query.trim()}”.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-[var(--line)] overflow-y-auto overscroll-contain rounded-xl border border-[var(--line)] sm:max-h-96">
              {filtered.map((m) => (
                <li
                  key={m.uid}
                  className="flex flex-wrap items-center justify-between gap-3 px-3 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[var(--ink)]">
                      {m.displayName}
                      {m.isOrganizer ? (
                        <span className="ml-2 badge badge-pink">Host</span>
                      ) : null}
                    </p>
                    {m.email ? (
                      <p className="truncate text-xs text-[var(--ink-soft)]">
                        {m.email}
                      </p>
                    ) : null}
                    <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                      Joined via {viaLabel(m.via)}
                      {m.joinedAt
                        ? ` · ${new Date(m.joinedAt).toLocaleString()}`
                        : ""}
                    </p>
                  </div>
                  {!m.isOrganizer ? (
                    <button
                      type="button"
                      className="btn btn-outline btn-sm text-[var(--danger)]"
                      disabled={busy || removing}
                      onClick={() => setRemoveTarget(m)}
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove this person?"
        description={
          removeTarget ? (
            <>
              <p className="mb-2 font-medium">{removeTarget.displayName}</p>
              <p>
                They lose access right away. There is no ban list; they can
                rejoin if they still have the entry code or remain on the invite
                list.
              </p>
            </>
          ) : null
        }
        confirmLabel="Remove"
        cancelLabel="Keep"
        danger
        busy={removing}
        onCancel={() => {
          if (!removing) setRemoveTarget(null);
        }}
        onConfirm={() => void confirmRemove()}
      />
    </section>
  );
}
