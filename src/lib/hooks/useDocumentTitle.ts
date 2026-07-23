"use client";

import { useEffect } from "react";
import { pageTitle } from "@/lib/branding";

/** Keep browser tab titles consistent with SEO template (client routes). */
export function useDocumentTitle(segment: string | undefined | null) {
  useEffect(() => {
    if (!segment?.trim()) return;
    const previous = document.title;
    document.title = pageTitle(segment);
    return () => {
      document.title = previous;
    };
  }, [segment]);
}
