"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  isSafeReturnPath,
  resolvePostAuthPath,
} from "@/lib/auth-redirect";
import { ORG_URL } from "@/lib/branding";

function useLandingAuth() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextParam = searchParams.get("next");
  const pendingTarget =
    nextParam && isSafeReturnPath(nextParam) ? nextParam : null;
  const pendingInvite =
    pendingTarget != null && pendingTarget.startsWith("/join");
  const pendingRoom =
    pendingTarget != null && pendingTarget.startsWith("/rooms/")
      ? pendingTarget
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

  return {
    user,
    loading,
    signingIn,
    error,
    pendingTarget,
    pendingInvite,
    pendingRoom,
    onSignIn,
  };
}

const DEFAULT_LEAD =
  "Ask questions, run live polls, and present to the room, all in one place.";

function LandingGateInner({ children }: { children: ReactNode }) {
  const { user, loading } = useLandingAuth();

  if (!loading && user) {
    return (
      <p className="mt-16 text-center text-sm text-[var(--ink-muted)]">
        Taking you in…
      </p>
    );
  }

  return children;
}

/** Hides marketing chrome once signed in and redirects into the app. */
export function LandingGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={children}>
      <LandingGateInner>{children}</LandingGateInner>
    </Suspense>
  );
}

function LandingAuthInner({
  variant,
  showByline = false,
}: {
  variant: "hero" | "close";
  showByline?: boolean;
}) {
  const {
    loading,
    signingIn,
    error,
    pendingTarget,
    pendingInvite,
    pendingRoom,
    onSignIn,
  } = useLandingAuth();

  const heroSupport = pendingInvite
    ? "Sign in to join the room with your invite code."
    : pendingRoom
      ? "Sign in to open the room you were invited to."
      : DEFAULT_LEAD;

  return (
    <>
      {variant === "hero" ? (
        <>
          <p className="landing-lead">{heroSupport}</p>
          {showByline ? (
            <p className="landing-byline">
              By{" "}
              <a
                href={ORG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-byline-link"
              >
                Rotaract South Asia MDIO (RSAMDIO)
              </a>
              .
            </p>
          ) : null}
          {pendingTarget ? (
            <p className="landing-continue">
              Continue to <span>{pendingTarget}</span>
            </p>
          ) : null}
        </>
      ) : null}

      <div className="landing-cta">
        <button
          type="button"
          className="btn btn-primary"
          disabled={loading || signingIn}
          onClick={() => void onSignIn()}
        >
          {signingIn ? "Signing in…" : "Continue with Google"}
        </button>
        {!pendingTarget ? (
          <Link href="/join" className="btn btn-outline">
            Join with a code
          </Link>
        ) : null}
      </div>

      {error ? (
        <p className="landing-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

function LandingAuthFallback({
  variant,
  showByline = false,
}: {
  variant: "hero" | "close";
  showByline?: boolean;
}) {
  return (
    <>
      {variant === "hero" ? (
        <>
          <p className="landing-lead">{DEFAULT_LEAD}</p>
          {showByline ? (
            <p className="landing-byline">
              By{" "}
              <a
                href={ORG_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="landing-byline-link"
              >
                Rotaract South Asia MDIO (RSAMDIO)
              </a>
              .
            </p>
          ) : null}
        </>
      ) : null}
      <div className="landing-cta">
        <button type="button" className="btn btn-primary" disabled>
          Continue with Google
        </button>
        <Link href="/join" className="btn btn-outline">
          Join with a code
        </Link>
      </div>
    </>
  );
}

/** Hero or close CTAs and invite deep-link messaging. */
export function LandingAuth({
  variant,
  showByline = false,
}: {
  variant: "hero" | "close";
  showByline?: boolean;
}) {
  return (
    <Suspense
      fallback={
        <LandingAuthFallback variant={variant} showByline={showByline} />
      }
    >
      <LandingAuthInner variant={variant} showByline={showByline} />
    </Suspense>
  );
}
