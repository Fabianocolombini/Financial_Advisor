import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/home", destination: "/homing", permanent: false },
      { source: "/mercado", destination: "/markets", permanent: true },
      { source: "/mercado/:symbol", destination: "/markets/:symbol", permanent: true },
      { source: "/orcamento", destination: "/budget", permanent: true },
      { source: "/objetivos", destination: "/goals", permanent: true },
      { source: "/patrimonio", destination: "/net-worth", permanent: true },
      { source: "/legal/privacidade", destination: "/legal/privacy", permanent: true },
      { source: "/legal/termos", destination: "/legal/terms", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
