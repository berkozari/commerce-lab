import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "../../src/generated/prisma/client.js";
import { checkoutSchema } from "../../src/schemas/checkout.schema.js";
import { AppError } from "../../src/utils/app-error.js";

const mock = vi.hoisted(() => ({
    findUnique: vi.fn(),
    orderTransaction: vi.fn(),
}));

vi.mock("../../src/config/database.js", () => ({
    getPrisma: () => ({ order: { findUnique: mock.findUnique } }),
}));

vi.mock("../../src/repositories/order.repository.js", () => ({
    orderInclude: { items: { orderBy: { id: "asc" } } },
    orderTransaction: mock.orderTransaction,
    findOwnedOrder: vi.fn(),
}));

const { orderService, checkoutFingerprint } = await import("../../src/services/order.service.js");

const userId = "11111111-1111-4111-8111-111111111111";
const key = "ec014-idempotency-test-key";
const input = checkoutSchema.parse({
    shippingAddress: {
        recipientName: "Checkout Customer",
        phone: "+905551112233",
        country: "TR",
        city: "Istanbul",
        district: "Kadikoy",
        addressLine: "Test address number 123",
    },
});

function savedOrder(checkoutFingerprintValue: string) {
    const now = new Date("2026-11-20T10:00:00Z");
    return {
        id: "22222222-2222-4222-8222-222222222222",
        userId,
        idempotencyKey: key,
        checkoutFingerprint: checkoutFingerprintValue,
        orderNumber: "CL-EC014-IDEMPOTENCY",
        status: "PENDING",
        paymentStatus: "UNPAID",
        currency: "TRY",
        subtotal: new Prisma.Decimal("35.50"),
        shippingAmount: new Prisma.Decimal("0"),
        total: new Prisma.Decimal("35.50"),
        shippingAddressSnapshot: input.shippingAddress,
        items: [],
        createdAt: now,
        updatedAt: now,
    };
}

function conflictError(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError(
        "Simulated concurrent idempotency-key collision",
        { code: "P2002", clientVersion: "7.10.0" },
    );
}

beforeEach(() => {
    vi.resetAllMocks();
    mock.findUnique.mockResolvedValue(null);
});

describe("checkout: P2002 idempotency conflict recovery (database-free)", () => {
    it("replays an already stored checkout before starting a transaction", async () => {
        mock.findUnique.mockResolvedValue(savedOrder(checkoutFingerprint(input)));

        await expect(orderService.checkout(userId, input, key)).resolves.toMatchObject({
            replayed: true,
            order: { id: savedOrder(checkoutFingerprint(input)).id, total: "35.50" },
        });
        expect(mock.findUnique).toHaveBeenCalledTimes(1);
        expect(mock.orderTransaction).not.toHaveBeenCalled();
    });

    it("rejects the same key with a different fingerprint before a transaction", async () => {
        mock.findUnique.mockResolvedValue(savedOrder("different-fingerprint"));

        await expect(orderService.checkout(userId, input, key)).rejects.toMatchObject({
            statusCode: 409,
            message: "Idempotency key used for a different request",
        });
        expect(mock.findUnique).toHaveBeenCalledTimes(1);
        expect(mock.orderTransaction).not.toHaveBeenCalled();
    });

    it("recovers a matching order after a concurrent P2002 constraint race", async () => {
        mock.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(savedOrder(checkoutFingerprint(input)));
        mock.orderTransaction.mockRejectedValue(conflictError());

        await expect(orderService.checkout(userId, input, key)).resolves.toMatchObject({
            replayed: true,
            order: { id: savedOrder(checkoutFingerprint(input)).id, total: "35.50" },
        });
        expect(mock.orderTransaction).toHaveBeenCalledTimes(1);
        expect(mock.findUnique).toHaveBeenCalledTimes(2);
        expect(mock.findUnique).toHaveBeenNthCalledWith(2, {
            where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
            include: expect.any(Object),
        });
    });

    it("rejects P2002 recovery when the winner used a different request", async () => {
        mock.findUnique
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(savedOrder("different-fingerprint"));
        mock.orderTransaction.mockRejectedValue(conflictError());

        await expect(orderService.checkout(userId, input, key)).rejects.toMatchObject({
            statusCode: 409,
            message: "Idempotency key used for a different request",
        });
        expect(mock.orderTransaction).toHaveBeenCalledTimes(1);
        expect(mock.findUnique).toHaveBeenCalledTimes(2);
    });

    it("preserves the original P2002 if no committed order can be found", async () => {
        const error = conflictError();
        mock.orderTransaction.mockRejectedValue(error);

        await expect(orderService.checkout(userId, input, key)).rejects.toBe(error);
        expect(mock.findUnique).toHaveBeenCalledTimes(2);
        expect(mock.orderTransaction).toHaveBeenCalledTimes(1);
    });

    it("does not re-query for or swallow unrelated transaction failures", async () => {
        const error = new AppError("Concurrent order operation; retry request", 409);
        mock.orderTransaction.mockRejectedValue(error);

        await expect(orderService.checkout(userId, input, key)).rejects.toBe(error);
        expect(mock.findUnique).toHaveBeenCalledTimes(1);
        expect(mock.orderTransaction).toHaveBeenCalledTimes(1);
    });
});
