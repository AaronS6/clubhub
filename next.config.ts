import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Do NOT ignore TypeScript build errors — real type errors should fail the
  // build, not be silently swallowed. (Previously `ignoreBuildErrors: true`
  // was set, which hides bugs shipping to users.)
  typescript: {
    ignoreBuildErrors: false,
  },
  // Strict Mode helps catch subtle bugs (double-invoked effects, unexpected
  // side effects) during development. Previously disabled — re-enabled.
  reactStrictMode: true,
};

export default nextConfig;
