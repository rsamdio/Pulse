import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Join with a code",
  description:
    "Enter a 6-digit code to join a Pulse live Q&A room. By Rotaract South Asia MDIO.",
  alternates: { canonical: "/join" },
  openGraph: {
    title: "Join with a code | Pulse",
    description:
      "Enter a 6-digit code to join a Pulse live Q&A room. By Rotaract South Asia MDIO.",
    url: "/join",
  },
};

export default function JoinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
