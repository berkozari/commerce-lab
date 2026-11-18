import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { requireDatabaseUrl } from "./env.js";

let prisma: PrismaClient | undefined;

export function getPrisma(): PrismaClient {
    if (!prisma) {
        const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });
        prisma = new PrismaClient({ adapter });
    }
    return prisma;
}

export async function disconnectDatabase(): Promise<void> {
    if (prisma) {
        await prisma.$disconnect();
        prisma = undefined;
    }
}
