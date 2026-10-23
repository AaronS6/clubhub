import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import GoogleProvider from "next-auth/providers/google"
import { db } from "@/lib/db"
import { verifyPassword } from "@/lib/auth"

/**
 * ⚠️ FAIL CLOSED in production: the historic fallback secret is committed to
 * the public repo, so any deployment without NEXTAUTH_SECRET set would sign
 * session JWTs with a KNOWN key — anyone could forge an admin session. A hard
 * startup error is far better than silently-forgeable sessions. (Dev keeps a
 * local .env value; the dev fallback only ever exists on a dev machine.)
 *
 * One exception: `next build` sets NEXT_PHASE=phase-production-build while it
 * imports every route module to collect page data. No requests are served and
 * no sessions are minted during the build, so a missing secret there must not
 * abort the Docker image build. Runtime (NODE_ENV=production, no NEXT_PHASE)
 * still fails closed exactly as before.
 */
function requireSessionSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET
  const isNextBuild = process.env.NEXT_PHASE === "phase-production-build"
  if (!secret && process.env.NODE_ENV === "production" && !isNextBuild) {
    throw new Error(
      "[auth] NEXTAUTH_SECRET is not set. Generate one with `openssl rand -hex 32` and set it in the environment — refusing to start with forgeable sessions.",
    )
  }
  return secret ?? "dev-secret-change-me-in-production"
}

// NOTE: no per-email/per-IP login rate limiting by design. School networks
// NAT an entire campus (or a computer lab signing in at once) behind ONE
// public IP, so IP-based caps lock real students out of their accounts and
// read as "bot detection" to them. Password hashing + the silent null return
// remain the anti-brute-force posture.

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: { signIn: "/" },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Only enabled if the env vars are set (avoids errors if Google isn't configured).
      ...(process.env.GOOGLE_CLIENT_ID ? {} : { id: "google-disabled", name: "Google (not configured)" }),
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        try {
          if (!credentials?.email || !credentials?.password) return null
          const email = credentials.email.toLowerCase().trim()

          const user = await db.user.findUnique({ where: { email } })
          if (!user) return null
          const ok = await verifyPassword(credentials.password, user.passwordHash ?? "")
          if (!ok) return null
          // ⚠️ Do NOT include `image`/`avatarUrl` here — NextAuth merges every
          // field of this returned object into the JWT, which is stored as a
          // browser cookie. Avatars are stored as base64 data URLs (~15KB),
          // so including one here balloons the session cookie past the HTTP
          // header limit and every subsequent request 431s. The session
          // callback below re-fetches the avatar from the DB at read time, so
          // the client still receives it via /api/auth/session.
          return { id: user.id, name: user.name, email: user.email }
        } catch (e) {
          console.error("[auth] authorize error:", e)
          return null
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google") {
          // Google sign-in: the `user.id` here is a NextAuth-generated ID,
          // NOT our DB user ID. Look up (or auto-create) the DB user by email
          // and store the DB ID in the token so the session callback can
          // fetch the real profile.
          const dbUser = await db.user.upsert({
            where: { email: user.email! },
            create: {
              name: user.name ?? "",
              email: user.email!,
              passwordHash: null, // Google users have no password
              emailVerified: true,
              avatarUrl: user.image ?? undefined,
            },
            update: {}, // don't overwrite existing user's data
          })
          token.id = dbUser.id
        } else {
          // Credentials provider: user.id is already the DB user ID.
          token.id = user.id
        }
      }
      // Defensive: strip any avatar/image data that NextAuth may have
      // auto-merged from a prior token or default mapping. Never persist
      // the base64 avatar data URL in the JWT cookie (would cause HTTP 431).
      if ("picture" in token) delete (token as Record<string, unknown>).picture
      if ("image" in token) delete (token as Record<string, unknown>).image
      return token
    },
    async session({ session, token }) {
      try {
        if (session.user && token.id) {
          session.user.id = token.id as string
          const dbUser = await db.user.findUnique({
            where: { id: token.id as string },
            select: { name: true, email: true, avatarUrl: true, bio: true, avatarDecoration: true },
          })
          if (dbUser) {
            session.user.name = dbUser.name
            session.user.email = dbUser.email
            session.user.image = dbUser.avatarUrl ?? undefined
            session.user.avatarDecoration = dbUser.avatarDecoration ?? "none"
          }
        }
      } catch (e) {
        console.error("[auth] session callback error:", e)
      }
      return session
    },
  },
  secret: requireSessionSecret(),
}
