import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { pageTitle } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms of Service for Pulse, operated by Rotaract South Asia MDIO (RSAMDIO).",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: pageTitle("Terms of Service"),
    description:
      "Terms of Service for Pulse, operated by Rotaract South Asia MDIO (RSAMDIO).",
    url: "/terms",
  },
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="24 July 2026">
      <p>
        Pulse is a live room product for Q&A and audience engagement, owned and
        operated by <strong>Rotaract South Asia MDIO (RSAMDIO)</strong>. By
        signing in and using Pulse, you agree to these terms and our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Using Pulse</h2>
      <p>
        You must sign in with a Google account that has a verified email. You
        are responsible for activity under your account. Do not share join codes
        or invite links in ways that violate your room’s rules or applicable
        law.
      </p>

      <h2>Rooms and content</h2>
      <p>
        Organizers create rooms and control access, moderation, and settings
        such as view-only or anonymous mode. Questions, descriptions, votes,
        and Engage responses you submit may be visible to others in that room.
        Organizers may remove questions, close engagements, or delete rooms.
      </p>
      <p>
        In anonymous rooms, display names on questions are hidden in the
        product UI. Pulse may still store account identifiers needed to run
        voting, engagement responses, moderation, and abuse prevention.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Do not post unlawful, harassing, or abusive content. Do not attempt to
        disrupt rooms, bypass access controls, scrape data, or misuse the
        service. RSAMDIO may suspend access if these terms are violated.
      </p>

      <h2>Analytics</h2>
      <p>
        Pulse uses Google Analytics to measure site usage and improve the
        product. Details are in the Privacy Policy.
      </p>

      <h2>Availability</h2>
      <p>
        Pulse is provided as-is. Features may change, and RSAMDIO does not
        guarantee uninterrupted access. RSAMDIO is not liable for lost
        questions, votes, or other content if a room is deleted or the service
        is unavailable.
      </p>

      <h2>Contact</h2>
      <p>
        For questions about these terms, contact Rotaract South Asia MDIO
        (RSAMDIO), the operator of Pulse.
      </p>
    </LegalPage>
  );
}
