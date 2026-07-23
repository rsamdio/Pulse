import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/branding";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/join", "/terms", "/privacy"],
        disallow: ["/rooms/", "/rooms"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
