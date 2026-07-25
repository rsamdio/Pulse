import type { Metadata } from "next";
import { LegalPage } from "@/components/LegalPage";
import { pageTitle } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Privacy Policy for Pulse, operated by Rotaract South Asia MDIO (RSAMDIO).",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: pageTitle("Privacy Policy"),
    description:
      "Privacy Policy for Pulse, operated by Rotaract South Asia MDIO (RSAMDIO).",
    url: "/privacy",
  },
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="24 July 2026">
      <p>
        This policy explains what{" "}
        <strong>Rotaract South Asia MDIO (RSAMDIO)</strong> collects when you
        use Pulse, and how that information is used. Pulse is owned and
        operated by RSAMDIO.
      </p>

      <h2>Information we collect</h2>
      <p>
        When you sign in with Google, we receive your account identifier, email
        address, display name, and profile photo URL from Google Authentication.
        We store a user profile so we can recognize you across rooms.
      </p>
      <p>
        When you use Pulse we also process room titles and descriptions,
        questions and optional descriptions, votes, engagements and engagement
        responses, invite lists, join codes, room membership, and organizer
        settings. Technical logs may include timestamps and error details needed
        to keep the service running.
      </p>

      <h2>Analytics</h2>
      <p>
        Pulse uses Google Analytics to understand how the site is used, such as
        pages visited, approximate location derived from IP, device and browser
        type, and referral information. Google may process this data under its
        own terms. RSAMDIO uses these reports to improve Pulse, not to sell
        personal information.
      </p>

      <h2>How we use information</h2>
      <p>
        RSAMDIO uses this information to authenticate you, show rooms you can
        access, run live Q&A boards, enforce access modes, support moderation,
        measure product usage, and improve reliability. Organizers may export
        questions from rooms they manage.
      </p>

      <h2>Sharing</h2>
      <p>
        Content you post in a room is visible to others who can enter that room.
        We use Firebase (Google) to host authentication, databases, and cloud
        functions for Pulse, and Google Analytics for usage measurement. RSAMDIO
        does not sell your personal information.
      </p>

      <h2>Anonymous rooms</h2>
      <p>
        In anonymous rooms, other participants generally see authors as
        Anonymous. Account-level identifiers may still be stored so voting and
        moderation can work. Analytics may still record visits to those pages.
      </p>

      <h2>Retention</h2>
      <p>
        Data stays in a room until an organizer deletes questions or the room
        itself. Account profiles remain while your account is used with Pulse.
        Analytics retention follows Google Analytics settings used for Pulse.
      </p>

      <h2>Your choices</h2>
      <p>
        You can sign out at any time. Browser settings and extensions may limit
        analytics cookies or scripts. To request deletion of your account data,
        contact RSAMDIO. Organizers control room-level content, including
        deletion.
      </p>

      <h2>Contact</h2>
      <p>
        For privacy questions, contact Rotaract South Asia MDIO (RSAMDIO), the
        operator of Pulse.
      </p>
    </LegalPage>
  );
}
