import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your rooms",
  description:
    "Manage and open your Pulse rooms. By Rotaract South Asia MDIO.",
  robots: { index: false, follow: false },
};

export default function RoomsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
