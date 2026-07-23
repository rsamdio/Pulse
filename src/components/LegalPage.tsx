import type { ReactNode } from "react";
import Link from "next/link";

export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="legal-page mx-auto w-full max-w-2xl">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--ink-muted)]">
        Pulse
      </p>
      <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-[var(--secondary)] sm:text-4xl">
        {title}
      </h1>
      <p className="mt-2 text-sm text-[var(--ink-muted)]">Last updated {updated}</p>
      <div className="legal-body mt-8 space-y-5 text-sm leading-relaxed text-[var(--ink-soft)]">
        {children}
      </div>
      <p className="mt-10 text-sm text-[var(--ink-muted)]">
        <Link href="/" className="font-semibold text-[var(--secondary)] underline">
          Back to Pulse
        </Link>
      </p>
    </article>
  );
}
