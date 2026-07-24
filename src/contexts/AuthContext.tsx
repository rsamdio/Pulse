"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  getFirebaseAuth,
  getFirebaseFunctions,
  getFirestoreDb,
} from "@/lib/firebase/client";
import type { AppUser, UserRole } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  profile: AppUser | null;
  loading: boolean;
  isOrganizer: boolean;
  isAdmin: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readProfileFast(user: User): Promise<AppUser | null> {
  const db = getFirestoreDb();
  const [userSnap, organizerSnap, adminSnap] = await Promise.all([
    getDoc(doc(db, "users", user.uid)),
    getDoc(doc(db, "organizers", user.uid)),
    getDoc(doc(db, "admins", user.uid)),
  ]);

  if (!userSnap.exists()) return null;

  const data = userSnap.data();
  const role: UserRole = adminSnap.exists()
    ? "admin"
    : organizerSnap.exists()
      ? "organizer"
      : ((data.role as UserRole) ?? "attendee");

  return {
    uid: user.uid,
    email: (data.email as string) || user.email || "",
    displayName:
      (data.displayName as string) || user.displayName || "User",
    role,
    createdAt: (data.createdAt as number) || Date.now(),
  };
}

async function ensureUserRemote(forceSyncAllowlist = false): Promise<AppUser> {
  const ensureUser = httpsCallable(getFirebaseFunctions(), "ensureUser");
  const result = await ensureUser({ forceSyncAllowlist });
  return result.data as AppUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!getFirebaseAuth().currentUser) {
      setProfile(null);
      return;
    }
    const next = await ensureUserRemote(true);
    setProfile(next);
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (!next) {
        setProfile(null);
        setLoading(false);
        return;
      }

      // Fast path: read Firestore profile, unblock UI immediately.
      void (async () => {
        try {
          const fast = await readProfileFast(next);
          if (fast) {
            setProfile(fast);
            setLoading(false);
            // Background: refresh role/bootstrap without blocking UI
            void ensureUserRemote(false)
              .then((remote) => setProfile(remote))
              .catch((error) =>
                console.error("ensureUser background failed", error),
              );
            return;
          }

          // First login: must create profile via Callable
          const remote = await ensureUserRemote(true);
          setProfile(remote);
        } catch (error) {
          console.error("profile load failed", error);
          setProfile(null);
        } finally {
          setLoading(false);
        }
      })();
    });
    return () => unsub();
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(getFirebaseAuth(), provider);
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      isOrganizer:
        profile?.role === "organizer" || profile?.role === "admin",
      isAdmin: profile?.role === "admin",
      signInWithGoogle,
      signOut,
      refreshProfile,
    }),
    [user, profile, loading, signInWithGoogle, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
