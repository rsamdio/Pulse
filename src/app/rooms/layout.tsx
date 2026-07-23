import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your rooms",
  description: "Manage and open your Pulse live Q&A rooms.",
  robots: { index: false, follow: false },
};

export default function RoomsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
