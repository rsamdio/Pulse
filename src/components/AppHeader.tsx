"use client";

import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { UserMenu } from "@/components/UserMenu";
import { BrandLockup } from "@/components/BrandLockup";

export function AppHeader() {
  const { user, loading, signInWithGoogle } = useAuth();

  return (
    <header className="app-header">
      <div className="app-header-float">
        <div className="app-header-inner">
          <BrandLockup href={user ? "/rooms" : "/"} />

          <div className="flex items-center gap-1.5 sm:gap-2">
            {user ? (
              <>
                <Link href="/join" className="btn btn-outline btn-sm">
                  Join
                </Link>
                <UserMenu />
              </>
            ) : null}
            {!user && !loading ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => void signInWithGoogle()}
              >
                Sign in
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
