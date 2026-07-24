"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { rememberReturnTo } from "@/lib/auth-redirect";

export function RequireAuth({
  children,
  organizerOnly = false,
  adminOnly = false,
}: {
  children: ReactNode;
  organizerOnly?: boolean;
  adminOnly?: boolean;
}) {
  const { user, loading, isOrganizer, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      rememberReturnTo(pathname);
      router.replace(`/?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (adminOnly && !isAdmin) {
      router.replace("/rooms");
      return;
    }
    if (organizerOnly && !isOrganizer) {
      router.replace("/rooms");
    }
  }, [
    user,
    loading,
    organizerOnly,
    adminOnly,
    isOrganizer,
    isAdmin,
    router,
    pathname,
  ]);

  const blocked =
    !user ||
    (adminOnly && !isAdmin) ||
    (organizerOnly && !isOrganizer);

  if (loading || blocked) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center text-sm text-[var(--ink-muted)]">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
