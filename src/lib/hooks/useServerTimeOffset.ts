"use client";

import { useEffect, useState } from "react";
import { onValue, ref } from "firebase/database";
import { getRtdb } from "@/lib/firebase/client";

/**
 * RTDB `.info/serverTimeOffset` in milliseconds. Add to `Date.now()` to get an
 * estimate of the server clock, so countdowns line up with server-side expiry.
 */
export function useServerTimeOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const db = getRtdb();
    const unsub = onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
      const val = snap.val();
      setOffset(typeof val === "number" ? val : 0);
    });
    return () => unsub();
  }, []);

  return offset;
}
