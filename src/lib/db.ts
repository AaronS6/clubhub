import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Prisma reads the DATABASE_URL directly from the environment (as declared in
// schema.prisma). We do NOT override the datasource URL here — appending pool
// params in code caused bugs (double-appending, malformed URLs). Instead, the
// connection pool params (?connection_limit=3&pool_timeout=10) should be
// included directly in the DATABASE_URL env var set in Render.
//
// This is the Prisma-recommended approach and avoids all URL manipulation.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
