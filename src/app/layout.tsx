import type { Metadata } from "next";
import Script from "next/script";
import { Bodoni_Moda, Hanken_Grotesk } from "next/font/google";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { AppFooter } from "@/components/AppFooter";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_TITLE,
  ORG_NAME,
  SITE_NAME,
  SITE_URL,
  TITLE_SUFFIX,
} from "@/lib/branding";
import "./globals.css";

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
    template: `%s | ${TITLE_SUFFIX}`,
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
    siteName: TITLE_SUFFIX,
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
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-F2FEXLW09J"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-F2FEXLW09J');
          `}
        </Script>
        <AuthProvider>
          <AppHeader />
          <main className="app-main">{children}</main>
          <AppFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
