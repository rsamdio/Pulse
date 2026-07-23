"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { rememberReturnTo } from "@/lib/auth-redirect";

export function RequireAuth({
  children,
  organizerOnly = false,
}: {
  children: ReactNode;
  organizerOnly?: boolean;
}) {
  const { user, loading, isOrganizer } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      rememberReturnTo(pathname);
      router.replace(`/?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (organizerOnly && !isOrganizer) {
      router.replace("/rooms");
    }
  }, [user, loading, organizerOnly, isOrganizer, router, pathname]);

  if (loading || !user || (organizerOnly && !isOrganizer)) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center text-sm text-[var(--ink-muted)]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
