import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything here is per user and read at request time, so nothing is prerendered.
  allowedDevOrigins: process.env.DEV_ORIGINS ? process.env.DEV_ORIGINS.split(",") : [],
};

export default nextConfig;
