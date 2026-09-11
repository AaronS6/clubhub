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
const poolConfig = {
  connection_limit: parseInt(process.env.PRISMA_CONNECTION_LIMIT || '3', 10),
  pool_timeout: parseInt(process.env.PRISMA_POOL_TIMEOUT || '10', 10),
}

const datasourceUrl = process.env.DATABASE_URL?.includes('?')
  ? process.env.DATABASE_URL + `&connection_limit=${poolConfig.connection_limit}&pool_timeout=${poolConfig.pool_timeout}`
  : process.env.DATABASE_URL + `?connection_limit=${poolConfig.connection_limit}&pool_timeout=${poolConfig.pool_timeout}`

// No query logging — it was logging every SQL query to stdout, which `tee`
// writes into dev.log, growing it unbounded and consuming memory.
export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: { db: { url: datasourceUrl } },
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
