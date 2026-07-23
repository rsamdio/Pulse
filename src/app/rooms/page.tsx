"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { RoomListBadge, AccessBadge } from "@/components/AccessBadge";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import type { AccessibleRoomSummary } from "@/lib/types";

function RoomsContent() {
  const { isOrganizer } = useAuth();
  const [rooms, setRooms] = useState<AccessibleRoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listAccessibleRooms();
      setRooms(res.rooms);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            Your rooms
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[var(--ink-soft)]">
            Jump into a room you host or have been invited to.
          </p>
        </div>
        {isOrganizer ? (
          <Link href="/rooms/new" className="btn btn-primary btn-sm">
            New room
          </Link>
        ) : null}
      </div>

      {loading ? (
        <p className="mt-10 text-sm text-[var(--ink-muted)]">Loading rooms…</p>
      ) : null}
      {error ? (
        <p className="mt-6 rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {!loading && !error && rooms.length === 0 ? (
        <div className="panel mt-8 text-center">
          <h2 className="font-[family-name:var(--font-display)] text-xl">
            No rooms yet
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ink-soft)]">
            {isOrganizer
              ? "Create a room and share access with attendees."
              : "Ask an organizer for an invite, entry code, or open link."}
          </p>
          {isOrganizer ? (
            <Link href="/rooms/new" className="btn btn-primary mt-5">
              Create room
            </Link>
          ) : (
            <Link href="/join" className="btn btn-outline mt-5">
              Join with a code
            </Link>
          )}
        </div>
      ) : null}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <Link
            key={room.id}
            href={`/rooms/${room.id}`}
            className="room-tile rise"
          >
            <div className="mb-1 flex flex-wrap items-center gap-1.5">
              <RoomListBadge room={room} />
              {room.isOrganizer || room.via === "organizer" ? (
                <AccessBadge mode={room.accessMode} variant="room" />
              ) : null}
              {room.anonymous ? (
                <span className="badge badge-gold">Anonymous</span>
              ) : null}
            </div>
            <h2 className="room-tile-title">{room.title}</h2>
            <p className="room-tile-slug">
              /rooms/{room.slug || room.id}
            </p>
            {room.description ? (
              <p className="room-tile-desc line-clamp-2">{room.description}</p>
            ) : (
              <p className="room-tile-desc text-[var(--ink-muted)]">
                No description
              </p>
            )}
            <div className="mt-1 flex flex-wrap gap-1.5">
              {room.questionsLocked ? (
                <span className="badge">Locked</span>
              ) : null}
              {room.viewOnly ? <span className="badge">View only</span> : null}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function RoomsPage() {
  return (
    <RequireAuth>
      <RoomsContent />
    </RequireAuth>
  );
}
