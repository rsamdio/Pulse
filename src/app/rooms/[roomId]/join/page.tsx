"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { api } from "@/lib/api";
import { parseJoinCodeParam } from "@/lib/auth-redirect";
import { useDocumentTitle } from "@/lib/hooks/useDocumentTitle";

function JoinForm() {
  const params = useParams<{ roomId: string }>();
  const roomId = params.roomId;
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useDocumentTitle("Enter entry code");

  useEffect(() => {
    const fromQuery = parseJoinCodeParam(searchParams.get("code"));
    if (fromQuery) setCode(fromQuery);
  }, [searchParams]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.redeemJoinCode({ roomId, code });
      router.replace(`/rooms/${roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-8">
      <div className="auth-card rise w-full max-w-md">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Enter entry code
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          This room is gated. Enter the 6-digit code from your organizer.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-6 space-y-3">
          <input
            className="field code-input"
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000"
            maxLength={6}
            required
            autoFocus
          />
          {error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : null}
          <button
            type="submit"
            className="btn btn-primary w-full"
            disabled={busy || code.length < 6}
          >
            {busy ? "Checking…" : "Join room →"}
          </button>
        </form>
        <p className="mt-4 text-center text-xs text-[var(--ink-muted)]">
          Or use{" "}
          <Link href="/join" className="font-semibold text-[var(--primary-deep)]">
            Join with a code
          </Link>{" "}
          from the header.
        </p>
        <Link
          href="/rooms"
          className="mt-4 inline-block text-sm text-[var(--ink-muted)]"
        >
          ← Back to rooms
        </Link>
      </div>
    </section>
  );
}

export default function RoomJoinPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <p className="mt-16 text-center text-sm text-[var(--ink-muted)]">
            Loading…
          </p>
        }
      >
        <JoinForm />
      </Suspense>
    </RequireAuth>
  );
}
