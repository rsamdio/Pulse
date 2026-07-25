"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { RequireAuth } from "@/components/RequireAuth";
import { api } from "@/lib/api";
import { parseJoinCodeParam } from "@/lib/auth-redirect";

function JoinByCodeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fromQuery = parseJoinCodeParam(searchParams.get("code"));
    if (fromQuery) setCode(fromQuery);
  }, [searchParams]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinByCode({ code });
      router.replace(`/rooms/${res.slug || res.roomId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join");
      setBusy(false);
    }
  };

  return (
    <section className="flex min-h-[calc(100vh-5rem)] items-center justify-center py-8">
      <div className="auth-card rise w-full max-w-md">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
          Intellectual exchange
        </p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Join with a code
        </h1>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          Enter the 6-digit access code provided by the host.
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
            {busy ? "Joining…" : "Join room →"}
          </button>
        </form>
        <Link
          href="/rooms"
          className="mt-5 inline-block text-sm text-[var(--ink-muted)]"
        >
          ← Back to rooms
        </Link>
      </div>
    </section>
  );
}

export default function JoinPage() {
  return (
    <RequireAuth>
      <Suspense
        fallback={
          <p className="mt-16 text-center text-sm text-[var(--ink-muted)]">
            Loading…
          </p>
        }
      >
        <JoinByCodeForm />
      </Suspense>
    </RequireAuth>
  );
}
