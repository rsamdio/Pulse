import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Present",
  description: "Present the live Engage prompt on a shared screen.",
  robots: { index: false, follow: false },
};

export default function PresentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
