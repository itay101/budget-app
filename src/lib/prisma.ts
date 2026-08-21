import { PrismaClient } from "@prisma/client";

// Avoid exhausting the connection limit by re-creating PrismaClient on every
// hot reload in dev — cache a single instance on the global object.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
