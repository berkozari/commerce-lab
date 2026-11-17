import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
    schema: "prisma/schema.prisma",
    migrations: {
        path: "prisma/migrations",
        seed: "tsx prisma/seed.ts",
    },
    // Generate / validate can run without a database; migrate cannot.
    datasource: {
        url: process.env.DATABASE_URL ?? "",
    },
});
