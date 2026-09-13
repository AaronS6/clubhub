import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma reads DATABASE_URL directly from the environment (as declared in
// schema.prisma). We do NOT override the datasource URL here — the pool
// params (?pgbouncer=true&connection_limit=1) should be in the DATABASE_URL
// env var set in Render. Appending them in code caused bugs (double-appending,
// conflicting connection_limit values).
export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
