import type { NextConfig } from "next";

// Headers for every response. The frame rules say SAMEORIGIN rather than DENY
// because the browser app frames this site's own /api/browse proxy.
const baseHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// The pages and API get the strict policy. /api/browse serves other people's pages, which the proxy
// rewrites with a <base> tag and whose forms it routes itself, so base-uri and form-action must stay
// open there; it keeps the frame rule so only this site can frame it.
const strictCsp = { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'" };
const proxyCsp = { key: "Content-Security-Policy", value: "frame-ancestors 'self'" };

const nextConfig: NextConfig = {
  // Everything here is per user and read at request time, so nothing is prerendered.
  allowedDevOrigins: process.env.DEV_ORIGINS ? process.env.DEV_ORIGINS.split(",") : [],
  // The dev badge would sit on top of the desktop.
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/((?!api/browse).*)", headers: [...baseHeaders, strictCsp] },
      { source: "/api/browse", headers: [...baseHeaders, proxyCsp] },
      // The admin panel shows other people's accounts: never cache it, never index it.
      { source: "/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/api/admin/:path*", headers: [{ key: "Cache-Control", value: "no-store" }, { key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
