import { app } from "./app.js";

const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer between 1 and 65535");
}

const server = app.listen(port, "127.0.0.1", () => {
    console.log(`CommerceLab API listening on http://localhost:${port}`);
});

function shutdown(signal: string) {
    console.log(`Received ${signal}; shutting down`);
    server.close((error) => {
        if (error) {
            console.error(error);
            process.exitCode = 1;
        }
    });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
