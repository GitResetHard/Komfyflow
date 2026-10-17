import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-mariadb", "mariadb", "bullmq", "ioredis"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
          },
        ],
      },
      {
        source: "/embed/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *; object-src 'none'; base-uri 'self'",
          },
        ],
      },
      {
        source: "/viewer/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors *; object-src 'none'; base-uri 'none'",
          },
        ],
      },
    ];
  },
};
export default config;
