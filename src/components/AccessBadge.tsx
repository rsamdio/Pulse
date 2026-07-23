"use client";

import type { AccessMode, AccessibleRoomSummary } from "@/lib/types";

const POLICY_LABELS: Record<AccessMode, string> = {
  public: "Open",
  allowlist: "Invite list",
  join_code: "Entry code",
  hybrid: "Invite or code",
};

export function roomListStatus(room: AccessibleRoomSummary): {
  label: string;
  tone: "pink" | "blue" | "neutral" | "gold" | "green";
} {
  if (room.isOrganizer || room.via === "organizer") {
    return { label: "Hosting", tone: "pink" };
  }
  if (room.accessMode === "public" || room.via === "public") {
    return { label: "Open room", tone: "green" };
  }
  if (room.accessMode === "allowlist") {
    return { label: "Invited", tone: "blue" };
  }
  return { label: "Private room", tone: "gold" };
}

export function AccessBadge({
  mode,
  variant = "policy",
}: {
  mode: AccessMode;
  variant?: "policy" | "room";
}) {
  if (variant === "room") {
    return (
      <span
        className={`badge ${mode === "public" ? "badge-green" : "badge-gold"}`}
      >
        {mode === "public" ? "Open room" : "Private room"}
      </span>
    );
  }

  return (
    <span
      className={`badge ${
        mode === "public"
          ? "badge-green"
          : mode === "allowlist"
            ? "badge-blue"
            : mode === "hybrid"
              ? "badge-gold"
              : "badge-pink"
      }`}
    >
      {POLICY_LABELS[mode]}
    </span>
  );
}

export function RoomListBadge({ room }: { room: AccessibleRoomSummary }) {
  const { label, tone } = roomListStatus(room);
  const cls =
    tone === "pink"
      ? "badge-pink"
      : tone === "blue"
        ? "badge-blue"
        : tone === "gold"
          ? "badge-gold"
          : tone === "green"
            ? "badge-green"
            : "";
  return <span className={`badge ${cls}`}>{label}</span>;
}
