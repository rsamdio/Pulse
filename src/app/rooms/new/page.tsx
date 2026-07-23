"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RequireAuth } from "@/components/RequireAuth";
import { api } from "@/lib/api";
import type { AccessMode } from "@/lib/types";
import { normalizeSlugInput } from "@/lib/utils";

const MODES: { id: AccessMode; label: string; hint: string }[] = [
  {
    id: "public",
    label: "Open",
    hint: "Anyone signed in can join with the link.",
  },
  {
    id: "allowlist",
    label: "Invite list",
    hint: "Only listed emails can enter.",
  },
  {
    id: "join_code",
    label: "Entry code",
    hint: "Auto 6-digit code. Share link or code.",
  },
  {
    id: "hybrid",
    label: "Invite or code",
    hint: "Allowlisted emails or the entry code.",
  },
];

function NewRoomForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [accessMode, setAccessMode] = useState<AccessMode>("public");
  const [anonymous, setAnonymous] = useState(false);
  const [allowlistText, setAllowlistText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsAllowlist = accessMode === "allowlist" || accessMode === "hybrid";
  const previewSlug = normalizeSlugInput(slug);

  const onTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) setSlug(normalizeSlugInput(value));
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const allowlistEmails = allowlistText
        .split(/[\n,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await api.createRoom({
        title,
        slug: previewSlug,
        description,
        accessMode,
        anonymous,
        allowlistEmails: needsAllowlist ? allowlistEmails : [],
      });
      router.push(`/rooms/${res.slug}/manage`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight sm:text-4xl">
            Create new room
          </h1>
          <p className="mt-1.5 text-sm text-[var(--ink-soft)]">
            Configure details for your upcoming live Q&A session.
          </p>
        </div>
        <Link href="/rooms" className="btn btn-ghost btn-sm" aria-label="Close">
          ✕
        </Link>
      </div>

      <form
        onSubmit={(e) => void onSubmit(e)}
        className="panel mt-6 space-y-5"
      >
        <label className="block space-y-1.5">
          <span className="label-caps">Room title</span>
          <input
            className="field"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            required
            maxLength={120}
            placeholder="e.g., Town hall Q&A"
          />
        </label>

        <label className="block space-y-1.5">
          <span className="label-caps">URL slug</span>
          <div className="flex items-center gap-2 rounded-[1rem] border border-[var(--line-strong)] bg-[var(--surface)] px-3">
            <span className="shrink-0 text-sm text-[var(--ink-muted)]">
              /rooms/
            </span>
            <input
              className="w-full border-0 bg-transparent py-2.5 font-mono outline-none"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
              onBlur={() => setSlug(normalizeSlugInput(slug))}
              required
              minLength={3}
              maxLength={64}
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              placeholder="town-hall-2026"
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="label-caps">Description optional</span>
          <textarea
            className="field min-h-20"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief context for attendees…"
          />
        </label>

        <fieldset className="space-y-2">
          <legend className="label-caps">Access mode</legend>
          <div className="mode-grid">
            {MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`mode-card ${
                  accessMode === mode.id ? "mode-card-on" : ""
                }`}
                onClick={() => setAccessMode(mode.id)}
              >
                <div className="text-sm font-semibold">{mode.label}</div>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">{mode.hint}</p>
              </button>
            ))}
          </div>
        </fieldset>

        <button
          type="button"
          className={`mode-card w-full text-left ${anonymous ? "mode-card-on" : ""}`}
          onClick={() => setAnonymous((v) => !v)}
        >
          <div className="text-sm font-semibold">Anonymous room</div>
          <p className="mt-1 text-xs text-[var(--ink-soft)]">
            Hide who posted each question. Authors show as Anonymous.
          </p>
        </button>

        {needsAllowlist ? (
          <label className="block space-y-1.5">
            <span className="label-caps">Invite list emails</span>
            <textarea
              className="field min-h-28 font-mono text-sm"
              value={allowlistText}
              onChange={(e) => setAllowlistText(e.target.value)}
              placeholder={"one@example.com\ntwo@example.com"}
            />
          </label>
        ) : null}

        {(accessMode === "join_code" || accessMode === "hybrid") && (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--surface-low)] px-3 py-2 text-xs text-[var(--ink-soft)]">
            A unique 6-digit entry code will be created automatically. View,
            copy, or rotate it anytime on Manage.
          </p>
        )}

        {error ? (
          <p className="rounded-xl border border-[var(--danger-soft)] bg-[var(--danger-soft)] px-3 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Link href="/rooms" className="btn btn-ghost">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? "Creating…" : "Create room →"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewRoomPage() {
  return (
    <RequireAuth organizerOnly>
      <NewRoomForm />
    </RequireAuth>
  );
}
