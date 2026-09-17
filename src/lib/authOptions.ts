import type { NextAuthOptions } from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import { verifyPassword } from "@/lib/auth"

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 }, // 30 days
  pages: { signIn: "/" },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials?.password) return null
          const email = credentials.email.toLowerCase().trim()
          const user = await db.user.findUnique({ where: { email } })
          if (!user) return null
          const ok = await verifyPassword(credentials.password, user.passwordHash)
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
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
            select: { name: true, email: true, avatarUrl: true, bio: true },
          })
          if (dbUser) {
            session.user.name = dbUser.name
            session.user.email = dbUser.email
            session.user.image = dbUser.avatarUrl ?? undefined
          }
        }
      } catch (e) {
        console.error("[auth] session callback error:", e)
      }
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me-in-production",
}
