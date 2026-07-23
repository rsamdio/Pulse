import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/events",
        destination: "/rooms",
        permanent: true,
      },
      {
        source: "/events/:path*",
        destination: "/rooms/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
