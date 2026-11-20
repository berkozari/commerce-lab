import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env, trustedProxyCidrs } from "./config/env.js";
import { mountSwagger } from "./config/swagger.js";
import { requestIdMiddleware } from "./middlewares/request-id.middleware.js";
import { notFoundMiddleware } from "./middlewares/not-found.middleware.js";
import { errorMiddleware } from "./middlewares/error.middleware.js";
import { apiRouter } from "./routes/index.js";

export const app = express();
// Do not trust client-supplied X-Forwarded-* headers by default.
// Only trust known reverse-proxy addresses when explicitly configured.
if (trustedProxyCidrs.length > 0) {
    app.set("trust proxy", trustedProxyCidrs);
}
app.disable("x-powered-by");
app.use(helmet());
// Return CORS credentials only to the explicitly configured frontend origin.
// In particular, do not advertise an allowed origin to unrelated origins.
app.use(cors({
    origin: (requestOrigin, callback) => {
        callback(null, requestOrigin === env.CORS_ORIGIN ? requestOrigin : false);
    },
    credentials: true,
}));
app.use(requestIdMiddleware);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
mountSwagger(app);
app.use("/api/v1", apiRouter);
app.use(notFoundMiddleware);
app.use(errorMiddleware);
