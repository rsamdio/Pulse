import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/join", "/terms", "/privacy"],
        disallow: ["/rooms/", "/rooms"],
      },
    ],
    sitemap: "https://pulse.rsamdio.org/sitemap.xml",
    host: "https://pulse.rsamdio.org",
  };
}
