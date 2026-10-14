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
  // On Vercel ONLY (the VERCEL env var is set to "1" in Vercel's build
  // environment), redirect every path to the Render deployment. Vercel
  // serves purely as a redirect proxy / vanity URL — the actual app runs on
  // Render. Locally and on Render (where VERCEL isn't set), this returns []
  // so the app serves normally.
  //
  // Why next.config redirects() instead of vercel.json `redirects`: Next.js
  // compiles these into routes-manifest.json, so they fire at the routing
  // layer BEFORE statically-prerendered routes are served. The vercel.json
  // form doesn't reliably override prerendered `/` (the root was being
  // served as static HTML, bypassing the redirect).
  async redirects() {
    if (process.env.VERCEL !== "1") return [];
    return [
      {
        source: "/:path*",
        destination: "https://clubhub-0rir.onrender.com/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
