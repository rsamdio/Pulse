import type { Metadata } from "next";
import { Bodoni_Moda, Hanken_Grotesk } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import "./globals.css";

const SITE_URL = "https://pulse.rsamdio.org";
const SITE_NAME = "Pulse";
const ORG_NAME = "Rotaract South Asia MDIO";
const DEFAULT_TITLE = "Pulse · Live Room Q&A | Rotaract South Asia MDIO";
const DEFAULT_DESCRIPTION =
  "Live rooms where the best questions rise to the top. By Rotaract South Asia MDIO.";

const display = Bodoni_Moda({
  variable: "--font-display",
  subsets: ["latin"],
});

const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Pulse",
    "live Q&A",
    "live room",
    "Rotaract",
    "Rotaract South Asia MDIO",
    "upvote questions",
    "room questions",
  ],
  authors: [{ name: ORG_NAME, url: "https://rsamdio.org" }],
  creator: ORG_NAME,
  publisher: ORG_NAME,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: `${SITE_NAME} · ${ORG_NAME}`,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Pulse · Live Room Q&A by Rotaract South Asia MDIO",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon.png", type: "image/png" },
      { url: "/favicon.webp", type: "image/webp" },
    ],
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="app-shell">
        <AuthProvider>
          <AppHeader />
          <main className="app-main">{children}</main>
          <AppFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
