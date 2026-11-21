import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma } from "../../src/generated/prisma/client.js";
import { getRefreshSessionId, hashToken, REFRESH_TTL_MS } from "../../src/lib/auth-crypto.js";
import { loginSchema, registerSchema } from "../../src/schemas/auth.schema.js";

const repository = vi.hoisted(() => ({
    createUser: vi.fn(),
    findUserByEmail: vi.fn(),
    createSession: vi.fn(),
}));

const password = vi.hoisted(() => ({
    hash: vi.fn(),
    verify: vi.fn(),
}));

vi.mock("../../src/repositories/auth.repository.js", () => ({
    authRepository: repository,
}));

// No expensive Argon2 work or real credentials are needed for service unit tests.
vi.mock("argon2", () => ({
    default: { argon2id: 2, hash: password.hash, verify: password.verify },
}));

vi.mock("../../src/lib/auth-crypto.js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../../src/lib/auth-crypto.js")>()),
    signAccessToken: vi.fn().mockResolvedValue("unit-test-access-token"),
}));

const { authService } = await import("../../src/services/auth.service.js");
const { signAccessToken } = await import("../../src/lib/auth-crypto.js");

const userId = randomUUID();
const publicUser = {
    id: userId,
    email: "customer@example.test",
    name: "Customer",
    role: "CUSTOMER" as const,
};
const persistedUser = { ...publicUser, passwordHash: "stored-argon2-hash" };
const registerInput = registerSchema.parse({
    name: "  Customer  ",
    email: "CUSTOMER@EXAMPLE.TEST",
    password: "correct-horse-battery-staple",
});
const loginInput = loginSchema.parse({
    email: "CUSTOMER@EXAMPLE.TEST",
    password: "correct-horse-battery-staple",
});

beforeEach(() => {
    vi.resetAllMocks();
    password.hash.mockResolvedValue("new-argon2id-hash");
    password.verify.mockResolvedValue(true);
    repository.createUser.mockResolvedValue(publicUser);
    repository.findUserByEmail.mockResolvedValue(persistedUser);
    repository.createSession.mockResolvedValue({ id: randomUUID() });
    vi.mocked(signAccessToken).mockResolvedValue("unit-test-access-token");
});

describe("authService.register lifecycle (database-free)", () => {
    it("normalizes registration input, hashes with Argon2id and creates a bound session", async () => {
        const result = await authService.register(registerInput);

        expect(registerInput).toMatchObject({ name: "Customer", email: "customer@example.test" });
        expect(password.hash).toHaveBeenCalledOnce();
        expect(password.hash).toHaveBeenCalledWith(registerInput.password, { type: 2 });
        expect(repository.createUser).toHaveBeenCalledWith({
            name: "Customer", email: "customer@example.test", passwordHash: "new-argon2id-hash",
        });
        expect(repository.createSession).toHaveBeenCalledOnce();
        const session = repository.createSession.mock.calls[0][0] as {
            id: string; userId: string; refreshTokenHash: string; expiresAt: Date;
        };
        expect(session).toMatchObject({
            id: expect.any(String),
            userId,
            refreshTokenHash: hashToken(result.refreshToken),
            expiresAt: expect.any(Date),
        });
        expect(getRefreshSessionId(result.refreshToken)).toBe(session.id);
        expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
        expect(session.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + REFRESH_TTL_MS);
        expect(signAccessToken).toHaveBeenCalledWith(userId, session.id);
        expect(result).toEqual({
            user: publicUser,
            refreshToken: expect.any(String),
            accessToken: "unit-test-access-token",
        });
        expect(result.user).not.toHaveProperty("passwordHash");
    });

    it("maps Prisma P2002 duplicate emails to 409 without creating a session", async () => {
        repository.createUser.mockRejectedValue(new Prisma.PrismaClientKnownRequestError(
            "duplicate email", { code: "P2002", clientVersion: "7.10.0" },
        ));

        await expect(authService.register(registerInput)).rejects.toMatchObject({
            message: "Email is already registered", statusCode: 409,
        });
        expect(repository.createSession).not.toHaveBeenCalled();
        expect(signAccessToken).not.toHaveBeenCalled();
    });

    it("does not mistake unrelated Prisma errors for duplicate emails", async () => {
        const error = new Prisma.PrismaClientKnownRequestError(
            "foreign key error", { code: "P2003", clientVersion: "7.10.0" },
        );
        repository.createUser.mockRejectedValue(error);

        await expect(authService.register(registerInput)).rejects.toBe(error);
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it("stops before user creation when password hashing fails", async () => {
        const error = new Error("password hashing unavailable");
        password.hash.mockRejectedValue(error);

        await expect(authService.register(registerInput)).rejects.toBe(error);
        expect(repository.createUser).not.toHaveBeenCalled();
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it("does not return tokens if new-session persistence fails", async () => {
        const error = new Error("session persistence failed");
        repository.createSession.mockRejectedValue(error);

        await expect(authService.register(registerInput)).rejects.toBe(error);
        expect(repository.createUser).toHaveBeenCalledOnce();
        expect(signAccessToken).not.toHaveBeenCalled();
    });
});

describe("authService.login lifecycle (database-free)", () => {
    it("verifies the saved password hash and creates a session without exposing the hash", async () => {
        const result = await authService.login(loginInput);

        expect(repository.findUserByEmail).toHaveBeenCalledOnce();
        expect(repository.findUserByEmail).toHaveBeenCalledWith("customer@example.test");
        expect(password.verify).toHaveBeenCalledOnce();
        expect(password.verify).toHaveBeenCalledWith("stored-argon2-hash", loginInput.password);
        expect(repository.createSession).toHaveBeenCalledOnce();
        const session = repository.createSession.mock.calls[0][0] as { id: string; userId: string; refreshTokenHash: string };
        expect(session.userId).toBe(userId);
        expect(session.refreshTokenHash).toBe(hashToken(result.refreshToken));
        expect(getRefreshSessionId(result.refreshToken)).toBe(session.id);
        expect(signAccessToken).toHaveBeenCalledWith(userId, session.id);
        expect(result.user).toEqual(publicUser);
        expect(result.user).not.toHaveProperty("passwordHash");
    });

    it("rejects an incorrect password without issuing a session", async () => {
        password.verify.mockResolvedValue(false);

        await expect(authService.login(loginInput)).rejects.toMatchObject({
            statusCode: 401, message: "Invalid email or password",
        });
        expect(password.verify).toHaveBeenCalledWith("stored-argon2-hash", loginInput.password);
        expect(repository.createSession).not.toHaveBeenCalled();
        expect(signAccessToken).not.toHaveBeenCalled();
    });

    it("still performs a dummy password comparison when the account does not exist", async () => {
        repository.findUserByEmail.mockResolvedValue(null);

        await expect(authService.login(loginInput)).rejects.toMatchObject({
            statusCode: 401, message: "Invalid email or password",
        });
        expect(password.verify).toHaveBeenCalledOnce();
        expect(password.verify).toHaveBeenCalledWith(expect.stringMatching(/^\$argon2id\$/), loginInput.password);
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it("never creates a session when a user lookup fails", async () => {
        const error = new Error("user lookup failed");
        repository.findUserByEmail.mockRejectedValue(error);

        await expect(authService.login(loginInput)).rejects.toBe(error);
        expect(password.verify).not.toHaveBeenCalled();
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it("never creates a session when password verification fails operationally", async () => {
        const error = new Error("Argon2 verification unavailable");
        password.verify.mockRejectedValue(error);

        await expect(authService.login(loginInput)).rejects.toBe(error);
        expect(repository.createSession).not.toHaveBeenCalled();
    });

    it("does not issue an access token when login session persistence fails", async () => {
        const error = new Error("session persistence failed");
        repository.createSession.mockRejectedValue(error);

        await expect(authService.login(loginInput)).rejects.toBe(error);
        expect(signAccessToken).not.toHaveBeenCalled();
    });

    it("issues independently hashed refresh tokens and session IDs on successive logins", async () => {
        const first = await authService.login(loginInput);
        const second = await authService.login(loginInput);
        const sessions = repository.createSession.mock.calls.map(([session]) => session as {
            id: string; refreshTokenHash: string;
        });

        expect(repository.createSession).toHaveBeenCalledTimes(2);
        expect(sessions[0].id).not.toBe(sessions[1].id);
        expect(first.refreshToken).not.toBe(second.refreshToken);
        expect(sessions[0].refreshTokenHash).not.toBe(sessions[1].refreshTokenHash);
        expect(getRefreshSessionId(first.refreshToken)).toBe(sessions[0].id);
        expect(getRefreshSessionId(second.refreshToken)).toBe(sessions[1].id);
    });
});
