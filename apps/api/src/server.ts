import { app } from "./app.js";
import { env, requireDatabaseUrl, requireAuthSecrets } from "./config/env.js";
import { disconnectDatabase } from "./config/database.js";
import { logger } from "./lib/logger.js";

// Fail fast on missing DB configuration in actual server startup, not during app-only unit tests.
requireDatabaseUrl();
requireAuthSecrets();
const server = app.listen(env.PORT, env.HOST, () => {
    logger.info({ port: env.PORT, host: env.HOST }, "CommerceLab API listening");
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Shutting down");
    const timeout = setTimeout(() => {
        logger.error("Shutdown timed out");
        process.exit(1);
    }, 10000);
    timeout.unref();
    try {
        await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
        await disconnectDatabase();
        clearTimeout(timeout);
    } catch (error) {
        logger.error({ err: error }, "Shutdown failed");
        process.exitCode = 1;
    }
}
process.on("SIGINT", () => { void shutdown("SIGINT"); });
process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
