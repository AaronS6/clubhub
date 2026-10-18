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

  // ── Security headers ──────────────────────────────────────────────────────
  // Baseline hardening for every environment + a strict Content-Security-Policy.
  // Notes on the CSP shape:
  //  - script/style 'unsafe-inline': Next.js injects inline bootstrap + hydrates
  //    with inline styles (Tailwind 4 emits inline <style> at build); without a
  //    nonce pipeline these are required. 'unsafe-eval' is dev-only (React
  //    Refresh) — production builds drop it.
  //  - img-src allows https: (Google sign-in avatars are external URLs), data:
  //    (legacy inline avatars) and blob: (client-side crop previews).
  //  - connect-src allows https:/wss: for the optionally-configured external
  //    realtime service (NEXT_PUBLIC_REALTIME_URL).
  //  - X-Frame-Options / frame-ancestors / HSTS are applied only in production:
  //    the sandbox preview panel embeds the dev server in a cross-origin iframe,
  //    and HSTS is meaningless on plain-http dev.
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (isProd ? "" : " 'unsafe-eval'"),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss: ws:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      ...(isProd ? ["frame-ancestors 'none'"] : []),
    ].join("; ");

    const headers = [
      {
        key: "Content-Security-Policy",
        value: csp,
      },
      {
        key: "X-Content-Type-Options",
        value: "nosniff",
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin",
      },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
      },
      {
        key: "X-DNS-Prefetch-Control",
        value: "off",
      },
    ];

    if (isProd) {
      headers.push(
        { key: "X-Frame-Options", value: "DENY" },
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains",
        },
      );
    }

    return [{ source: "/:path*", headers }];
  },
};

export default nextConfig;
