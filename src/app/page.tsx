"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  isSafeReturnPath,
  resolvePostAuthPath,
} from "@/lib/auth-redirect";

function HomeContent() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextParam = searchParams.get("next");
  const pendingRoom =
    nextParam &&
    isSafeReturnPath(nextParam) &&
    nextParam.startsWith("/rooms/")
      ? nextParam
      : null;

  useEffect(() => {
    if (!loading && user) {
      router.replace(resolvePostAuthPath(nextParam));
    }
  }, [user, loading, router, nextParam]);

  const onSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
      setSigningIn(false);
    }
  };

  if (!loading && user) {
    return (
      <p className="mt-16 text-center text-sm text-[var(--ink-muted)]">
        Taking you in…
      </p>
    );
  }

  return (
    <section className="flex min-h-[calc(100vh-8rem)] items-center justify-center py-8">
      <div className="auth-card rise">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--secondary)] sm:text-5xl">
          Pul<span className="text-[var(--primary-deep)]">se</span>
        </h1>
        <p className="mt-2 text-[0.68rem] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
          Live rooms
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--ink-soft)]">
          {pendingRoom
            ? "Sign in to open the room you were invited to."
            : "Live rooms for events and sessions. Organizers open a room; you sign in with Google to ask and upvote questions, or answer polls and short prompts on Engage."}
        </p>

        {pendingRoom ? (
          <p className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-low)] px-3 py-2 font-mono text-xs text-[var(--ink-soft)]">
            Continue to {pendingRoom}
          </p>
        ) : null}

        <button
          type="button"
          className="btn btn-primary mt-7 w-full"
          disabled={loading || signingIn}
          onClick={() => void onSignIn()}
        >
          {signingIn ? "Signing in…" : "Continue with Google"}
        </button>

        {error ? (
          <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
        ) : null}
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <p className="mt-16 text-center text-sm text-[var(--ink-muted)]">
          Loading…
        </p>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
