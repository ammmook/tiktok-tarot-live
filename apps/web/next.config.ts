import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tarot-live/shared", "@tarot-live/db"],
};

export default nextConfig;
