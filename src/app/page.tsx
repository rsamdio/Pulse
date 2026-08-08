"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
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

  if (!loading && user) {
    return (
      <p className="mt-16 text-center text-sm text-[var(--ink-muted)]">
        Taking you in…
      </p>
    );
  }

  const heroSupport = pendingInvite
    ? "Sign in to join the room with your invite code."
    : pendingRoom
      ? "Sign in to open the room you were invited to."
      : "Ask questions, run live polls, and present to the room, all in one place.";

  return (
    <div className="landing">
      <section className="landing-hero" aria-labelledby="landing-brand">
        <div className="landing-hero-glow" aria-hidden />
        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="landing-kicker">Live rooms</p>
            <h1 id="landing-brand" className="landing-brand">
              Pul<span className="landing-brand-accent">se</span>
            </h1>
            <p className="landing-lead">{heroSupport}</p>

            {pendingTarget ? (
              <p className="landing-continue">
                Continue to <span>{pendingTarget}</span>
              </p>
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
          </div>

          <div className="landing-hero-visual" aria-hidden>
            <div className="landing-stage">
              <div className="landing-stage-bar">
                <span className="landing-stage-dot" />
                <span className="landing-stage-dot" />
                <span className="landing-stage-dot" />
                <span className="landing-stage-tabs">
                  <span className="is-on">Ask</span>
                  <span>Engage</span>
                </span>
              </div>
              <div className="landing-stage-body">
                <article className="landing-q">
                  <div className="landing-q-vote">
                    <span>▲</span>
                    <strong>24</strong>
                  </div>
                  <div>
                    <p className="landing-q-text">
                      How do we onboard new club officers to the RI portal
                      faster this term?
                    </p>
                    <p className="landing-q-meta">Rtr. Aisha · live</p>
                  </div>
                </article>
                <article className="landing-q landing-q-soft">
                  <div className="landing-q-vote">
                    <span>▲</span>
                    <strong>11</strong>
                  </div>
                  <div>
                    <p className="landing-q-text">
                      Can districts share one Present screen across breakout
                      rooms?
                    </p>
                    <p className="landing-q-meta">Rtr. Kabir · 2m ago</p>
                  </div>
                </article>
                <div className="landing-engage-chip">
                  <span className="landing-engage-live">Live poll</span>
                  <p>Which session format works best for your club?</p>
                  <div className="landing-engage-bars">
                    <span style={{ width: "72%" }} />
                    <span style={{ width: "48%" }} />
                    <span style={{ width: "31%" }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="feat-ask">
        <div className="landing-section-inner landing-split">
          <div>
            <p className="landing-kicker">Ask</p>
            <h2 id="feat-ask" className="landing-h2">
              A live question board the room can feel.
            </h2>
            <p className="landing-copy">
              Attendees submit questions, upvote what matters, and watch the
              board reorder in real time. Organizers mark answered or remove
              noise without breaking the flow.
            </p>
          </div>
          <ul className="landing-points">
            <li>Upvotes surface the questions people care about</li>
            <li>Anonymous rooms when honesty needs cover</li>
            <li>Lock questions when it is time to listen</li>
          </ul>
        </div>
      </section>

      <section
        className="landing-section landing-section-tint"
        aria-labelledby="feat-engage"
      >
        <div className="landing-section-inner landing-split landing-split-flip">
          <div>
            <p className="landing-kicker">Engage</p>
            <h2 id="feat-engage" className="landing-h2">
              Polls, prompts, and word clouds on cue.
            </h2>
            <p className="landing-copy">
              Queue drafts, go live when you are ready, hide results until
              close, then reveal or advance. Optional timers and Present keep
              the session moving even when you are on stage.
            </p>
          </div>
          <ul className="landing-points">
            <li>Multiple choice, open text, and word clouds</li>
            <li>Hide until closed, with host Peek when you need it</li>
            <li>Numbered queue, grace window, and Cancel next</li>
          </ul>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="feat-present">
        <div className="landing-section-inner landing-split">
          <div>
            <p className="landing-kicker">Present</p>
            <h2 id="feat-present" className="landing-h2">
              Share the room, not your control panel.
            </h2>
            <p className="landing-copy">
              Open a clean Present window for the projector or screen share.
              The audience sees prompts and revealed results. Your manage
              tools stay on your own screen.
            </p>
          </div>
          <ul className="landing-points">
            <li>Audience-safe projection, no Peek chrome</li>
            <li>Fail-closed while results stay hidden</li>
            <li>Built for rooms, not slide decks</li>
          </ul>
        </div>
      </section>

      <section className="landing-close" aria-labelledby="landing-close-title">
        <div className="landing-close-inner">
          <h2 id="landing-close-title" className="landing-h2">
            Open a room. Let the room talk.
          </h2>
          <p className="landing-copy">
            Organizers create rooms. Everyone else signs in with Google to ask,
            upvote, and answer.
          </p>
          <div className="landing-cta">
            <button
              type="button"
              className="btn btn-primary"
              disabled={loading || signingIn}
              onClick={() => void onSignIn()}
            >
              {signingIn ? "Signing in…" : "Continue with Google"}
            </button>
            <Link href="/join" className="btn btn-outline">
              Join with a code
            </Link>
          </div>
        </div>
      </section>
    </div>
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
