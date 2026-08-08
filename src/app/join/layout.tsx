import type { Metadata } from "next";
import { ORG_NAME, pageTitle } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Join with a code",
  description: `Enter a 6-digit code to join a Pulse live room. By ${ORG_NAME}.`,
  alternates: { canonical: "/join" },
  openGraph: {
    title: pageTitle("Join with a code"),
    description: `Enter a 6-digit code to join a Pulse live room. By ${ORG_NAME}.`,
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
