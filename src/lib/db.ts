import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Connection pool sizing — important for serverless databases:
// - CockroachDB Serverless free tier: ~10-15 max connections
// - Supabase/Neon free tier: ~15-20 max connections
// - Render Postgres free: ~20 connections
// We cap the pool at 3 per instance + a 10s acquire timeout to stay safely
// under the limit even if multiple instances run. The app's queries are fast
// (parallelized in the performance pass) so 3 concurrent is plenty.
const connectionLimit = parseInt(process.env.PRISMA_CONNECTION_LIMIT || '3', 10)
const poolTimeout = parseInt(process.env.PRISMA_POOL_TIMEOUT || '10', 10)

// Build the datasource URL with pool params. Avoid double-appending if the
// DATABASE_URL already has query params (e.g. user added ?connection_limit=3
// manually in the Render env var — we don't want ?...&...&connection_limit=3).
const base = process.env.DATABASE_URL || ''
const separator = base.includes('?') ? '&' : '?'
const datasourceUrl = `${base}${separator}connection_limit=${connectionLimit}&pool_timeout=${poolTimeout}`

// No query logging — it was logging every SQL query to stdout, which `tee`
// writes into dev.log, growing it unbounded and consuming memory.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
