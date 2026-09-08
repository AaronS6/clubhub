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
        if (!credentials?.email || !credentials?.password) return null
        const email = credentials.email.toLowerCase().trim()
        const user = await db.user.findUnique({ where: { email } })
        if (!user) return null
        const ok = await verifyPassword(credentials.password, user.passwordHash)
        if (!ok) return null
        return { id: user.id, name: user.name, email: user.email, image: user.avatarUrl ?? undefined }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        // attach fresh name/avatar
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
      return session
    },
  },
  secret: process.env.NEXTAUTH_SECRET ?? "dev-secret-change-me-in-production",
}
