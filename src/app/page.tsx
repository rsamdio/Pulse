import type { Metadata } from "next";
import Link from "next/link";
import { LandingAuth, LandingGate } from "@/components/LandingAuth";
import {
  DEFAULT_TITLE,
  LANDING_DESCRIPTION,
  LANDING_KEYWORDS,
  OG_IMAGE_ALT,
  OG_IMAGE_HEIGHT,
  OG_IMAGE_PATH,
  OG_IMAGE_WIDTH,
  ORG_NAME,
  SITE_URL,
  TITLE_SUFFIX,
} from "@/lib/branding";
import { buildLandingJsonLd, LANDING_FAQS } from "@/lib/seo/jsonLd";

export const metadata: Metadata = {
  title: { absolute: DEFAULT_TITLE },
  description: LANDING_DESCRIPTION,
  keywords: [...LANDING_KEYWORDS],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: SITE_URL,
    siteName: TITLE_SUFFIX,
    title: DEFAULT_TITLE,
    description: LANDING_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_PATH,
        width: OG_IMAGE_WIDTH,
        height: OG_IMAGE_HEIGHT,
        alt: OG_IMAGE_ALT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: LANDING_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
};

export default function HomePage() {
  const jsonLd = buildLandingJsonLd(LANDING_FAQS);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <LandingGate>
        <div className="landing">
          <section className="landing-hero" aria-labelledby="landing-brand">
            <div className="landing-hero-glow" aria-hidden />
            <div className="landing-hero-grid">
              <div className="landing-hero-copy">
                <p className="landing-kicker">Live rooms</p>
                <h1 id="landing-brand" className="landing-brand">
                  Pul<span className="landing-brand-accent">se</span>
                </h1>
                <LandingAuth variant="hero" showByline />
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

          <section className="landing-section" aria-labelledby="feat-region">
            <div className="landing-section-inner landing-region">
              <p className="landing-kicker">South Asia</p>
              <h2 id="feat-region" className="landing-h2 landing-h2-wide">
                Built for Rotaract rooms across the region.
              </h2>
              <p className="landing-copy">
                From club meetings to district assemblies, Pulse helps organizers
                run live Q&amp;A and engagement for Rotaract audiences in South
                Asia. An initiative of {ORG_NAME} (RSAMDIO).
              </p>
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

          <section
            className="landing-section landing-section-tint"
            aria-labelledby="feat-faq"
          >
            <div className="landing-section-inner">
              <p className="landing-kicker">FAQ</p>
              <h2 id="feat-faq" className="landing-h2 landing-h2-wide">
                Common questions
              </h2>
              <dl className="landing-faq">
                {LANDING_FAQS.map((faq) => (
                  <div key={faq.question} className="landing-faq-item">
                    <dt>{faq.question}</dt>
                    <dd>{faq.answer}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <section
            className="landing-close"
            aria-labelledby="landing-close-title"
          >
            <div className="landing-close-inner">
              <h2 id="landing-close-title" className="landing-h2">
                Open a room. Let the room talk.
              </h2>
              <p className="landing-copy">
                Pulse is an RSAMDIO initiative for clubs and districts across
                South Asia. Organizers create rooms. Everyone else signs in with
                Google to ask, upvote, and answer.
              </p>
              <LandingAuth variant="close" />
              <p className="landing-close-links">
                <Link href="/terms">Terms</Link>
                <span aria-hidden>·</span>
                <Link href="/privacy">Privacy</Link>
              </p>
            </div>
          </section>
        </div>
      </LandingGate>
    </>
  );
}
