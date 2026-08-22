import { PrismaClient } from "@prisma/client";

// Avoid exhausting the connection limit by re-creating PrismaClient on every
// hot reload in dev — cache a single instance on the global object.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Vercel can run many serverless function instances concurrently, each
 * with its own long-lived PrismaClient — and by default each one opens
 * several connections of its own. Against a small pooled Postgres (e.g.
 * Supabase's Supavisor in session mode, capped well under a hundred
 * clients) a burst of concurrent instances can exhaust that pool. Capping
 * each instance to a couple of connections keeps the app's total footprint
 * small regardless of how many instances are running.
 */
function withConnectionLimit(url: string, limit = 2): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("connection_limit")) {
      parsed.searchParams.set("connection_limit", String(limit));
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: { url: withConnectionLimit(process.env.DATABASE_URL ?? "") },
    },
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
