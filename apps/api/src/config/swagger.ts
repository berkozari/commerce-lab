
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Express } from "express";
import swaggerUi from "swagger-ui-express";
import YAML from "yaml";

import { env } from "./env.js";

type SwaggerDocument = NonNullable<
    Parameters<typeof swaggerUi.setup>[0]
>;

export function mountSwagger(app: Express): void {
    if (env.NODE_ENV === "production") {
        return;
    }

    const specPath = resolve(
        process.cwd(),
        "docs/openapi/openapi.yaml",
    );

    const parsed: unknown = YAML.parse(
        readFileSync(specPath, "utf8"),
    );

    if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        !("openapi" in parsed) ||
        !("info" in parsed) ||
        !("paths" in parsed)
    ) {
        throw new Error(
            "Invalid OpenAPI document: required fields are missing",
        );
    }

    const spec = parsed as SwaggerDocument;

    app.use(
        "/api-docs",
        swaggerUi.serve,
        swaggerUi.setup(spec, {
            explorer: false,
            swaggerOptions: {
                supportedSubmitMethods: [],
            },
        }),
    );
}
