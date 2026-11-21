import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { AppError } from "../../src/utils/app-error.js";

const db = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("../../src/config/database.js", () => ({
    getPrisma: () => ({ $transaction: db.transaction }),
}));

const { orderTransaction } = await import("../../src/repositories/order.repository.js");

function prismaError(code: string): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
        `Simulated ${code}`,
        { code, clientVersion: "7.10.0" },
    );
}

beforeEach(() => {
    vi.resetAllMocks();
});

describe("orderTransaction: serializable retry boundaries (database-free)", () => {
    it("passes Serializable isolation and explicit timeouts to Prisma", async () => {
        const tx = { marker: "test-transaction" };
        const work = vi.fn().mockResolvedValue("committed");
        db.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<string>) => callback(tx));

        await expect(orderTransaction(work)).resolves.toBe("committed");
        expect(db.transaction).toHaveBeenCalledTimes(1);
        expect(db.transaction).toHaveBeenCalledWith(work, {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 5000,
            timeout: 10000,
        });
        expect(work).toHaveBeenCalledTimes(1);
        expect(work).toHaveBeenCalledWith(tx);
    });

    it("retries one P2034 failure and returns the second transaction's result", async () => {
        const work = vi.fn();
        db.transaction.mockRejectedValueOnce(prismaError("P2034")).mockResolvedValueOnce("committed");

        await expect(orderTransaction(work)).resolves.toBe("committed");
        expect(db.transaction).toHaveBeenCalledTimes(2);
        expect(db.transaction.mock.calls[0]?.[1]).toEqual(db.transaction.mock.calls[1]?.[1]);
    });

    it("allows a third attempt after two P2034 conflicts", async () => {
        db.transaction
            .mockRejectedValueOnce(prismaError("P2034"))
            .mockRejectedValueOnce(prismaError("P2034"))
            .mockResolvedValueOnce("third-attempt");

        await expect(orderTransaction(vi.fn())).resolves.toBe("third-attempt");
        expect(db.transaction).toHaveBeenCalledTimes(3);
    });

    it("reruns the transaction callback when the callback itself triggers P2034", async () => {
        const tx = { marker: "test-transaction" };
        const work = vi.fn()
            .mockRejectedValueOnce(prismaError("P2034"))
            .mockResolvedValueOnce("committed");
        db.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<string>) => callback(tx));

        await expect(orderTransaction(work)).resolves.toBe("committed");
        expect(db.transaction).toHaveBeenCalledTimes(2);
        expect(work).toHaveBeenCalledTimes(2);
        expect(work).toHaveBeenNthCalledWith(1, tx);
        expect(work).toHaveBeenNthCalledWith(2, tx);
    });

    it("stops after three P2034 failures and maps them to HTTP 409", async () => {
        db.transaction.mockRejectedValue(prismaError("P2034"));

        await expect(orderTransaction(vi.fn())).rejects.toMatchObject({
            name: "AppError",
            statusCode: 409,
            message: "Concurrent order operation; retry request",
        });
        expect(db.transaction).toHaveBeenCalledTimes(3);
    });

    it("does not retry P2002 unique-constraint conflicts", async () => {
        const error = prismaError("P2002");
        db.transaction.mockRejectedValue(error);

        await expect(orderTransaction(vi.fn())).rejects.toBe(error);
        expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("does not retry other Prisma errors such as P2028", async () => {
        const error = prismaError("P2028");
        db.transaction.mockRejectedValue(error);

        await expect(orderTransaction(vi.fn())).rejects.toBe(error);
        expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("does not retry arbitrary objects merely claiming code P2034", async () => {
        const error = Object.assign(new Error("not Prisma"), { code: "P2034" });
        db.transaction.mockRejectedValue(error);

        await expect(orderTransaction(vi.fn())).rejects.toBe(error);
        expect(db.transaction).toHaveBeenCalledTimes(1);
    });

    it("does not retry business-rule AppErrors raised in a transaction", async () => {
        const error = new AppError("Insufficient stock", 409);
        db.transaction.mockRejectedValue(error);

        await expect(orderTransaction(vi.fn())).rejects.toBe(error);
        expect(db.transaction).toHaveBeenCalledTimes(1);
    });
});
