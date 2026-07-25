"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { clearReturnTo } from "@/lib/auth-redirect";

export function UserMenu() {
  const { user, profile, signOut, isOrganizer, isAdmin } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!user) return null;

  const name = profile?.displayName ?? user.displayName ?? "User";
  const email = profile?.email ?? user.email ?? "";
  const photo = user.photoURL;
  const initial = name.trim().charAt(0).toUpperCase() || "U";
  const roleLabel = isAdmin ? "Admin" : isOrganizer ? "Organizer" : "Attendee";

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        type="button"
        className="user-avatar-btn"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
        title={name}
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="user-avatar-img" referrerPolicy="no-referrer" />
        ) : (
          <span className="user-avatar-fallback" aria-hidden>
            {initial}
          </span>
        )}
      </button>

      {open ? (
        <div className="user-menu-panel" id={menuId} role="menu">
          <div className="user-menu-identity">
            <p className="user-menu-name">{name}</p>
            {email ? <p className="user-menu-email">{email}</p> : null}
            <span className="badge badge-pink mt-2">{roleLabel}</span>
          </div>
          {isAdmin ? (
            <Link
              href="/admin"
              className="user-menu-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              Admin console
            </Link>
          ) : null}
          <button
            type="button"
            className="user-menu-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              clearReturnTo();
              void signOut().then(() => {
                router.replace("/");
              });
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
