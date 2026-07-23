"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { BrandLockup } from "@/components/BrandLockup";

/** Shown on the signed-out home page and legal pages only. */
export function AppFooter() {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const year = new Date().getFullYear();

  const isLegal =
    pathname === "/terms" ||
    pathname === "/privacy" ||
    pathname.startsWith("/terms/") ||
    pathname.startsWith("/privacy/");
  const isSignedOutHome = !user && (pathname === "/" || pathname === "");

  if (loading) return null;
  if (!isLegal && !isSignedOutHome) return null;

  return (
    <footer className="app-footer">
      <div className="app-footer-inner">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <BrandLockup href="/" size="sm" />
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <Link
              href="/terms"
              className="text-[var(--ink-muted)] hover:text-[var(--secondary)]"
            >
              Terms
            </Link>
            <Link
              href="/privacy"
              className="text-[var(--ink-muted)] hover:text-[var(--secondary)]"
            >
              Privacy
            </Link>
          </nav>
        </div>
        <p className="text-xs text-[var(--ink-muted)]">
          © {year} RSAMDIO. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
