import pino, { type LoggerOptions } from "pino";
import { env } from "../config/env.js";

// Redact known secret-bearing fields in structured logs. Do not log raw
// HTTP request bodies, cookies or token-bearing URLs anywhere in the app.
const secretFields = [
    "password",
    "passwordHash",
    "accessToken",
    "refreshToken",
    "csrfToken",
    "guestToken",
    "token",
];

export const loggerOptions: LoggerOptions = {
    level: env.LOG_LEVEL,
    redact: {
        paths: [
            ...secretFields,
            ...secretFields.map((field) => `*.${field}`),
            ...secretFields.map((field) => `req.body.${field}`),
            "authorization",
            "cookie",
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers['set-cookie']",
            "res.headers['set-cookie']",
            "headers.authorization",
            "headers.cookie",
            "headers['set-cookie']",
        ],
        censor: "[REDACTED]",
    },
};

export const logger = pino(loggerOptions);
