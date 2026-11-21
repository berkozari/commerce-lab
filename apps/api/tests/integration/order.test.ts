import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { checkoutFingerprint } from "../../src/services/order.service.js";
import {
    checkoutSchema, demoPaymentSchema, adminOrderStatusSchema, idempotencyKeySchema,
} from "../../src/schemas/checkout.schema.js";

let app: typeof import("../../src/app.js")["app"];
beforeAll(async () => {
    process.env.AUTH_JWT_SECRET ??= "test-only-jwt-secret-please-never-use-in-production-0001";
    process.env.AUTH_CSRF_SECRET ??= "test-only-csrf-secret-please-never-use-in-production-0002";
    ({ app } = await import("../../src/app.js"));
});

const address = {
    recipientName: "Test Customer", phone: "+905551112233", country: "TR",
    city: "Istanbul", district: "Kadikoy", addressLine: "Example street, number 123",
};

describe("Checkout schema (database-free)", () => {
    it("requires a complete shipping address and rejects client prices", () => {
        expect(checkoutSchema.safeParse({ shippingAddress: address }).success).toBe(true);
        expect(checkoutSchema.safeParse({ shippingAddress: { ...address, addressLine: "x" } }).success).toBe(false);
        expect(checkoutSchema.safeParse({ shippingAddress: address, total: "1.00" }).success).toBe(false);
        expect(checkoutSchema.safeParse({ shippingAddress: { ...address, price: "0.01" } }).success).toBe(false);
    });
    it("requires a safe idempotency key and controlled payment outcomes", () => {
        expect(idempotencyKeySchema.safeParse("ec007_request_abcdef123456").success).toBe(true);
        expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
        expect(demoPaymentSchema.safeParse({ outcome: "success" }).success).toBe(true);
        expect(demoPaymentSchema.safeParse({ outcome: "charge-card" }).success).toBe(false);
        expect(adminOrderStatusSchema.safeParse({ status: "PROCESSING" }).success).toBe(true);
        expect(adminOrderStatusSchema.safeParse({ status: "PENDING" }).success).toBe(false);
    });
    it("computes a deterministic fingerprint for validated shipping address", () => {
        const input = checkoutSchema.parse({ shippingAddress: address });
        expect(checkoutFingerprint(input)).toBe(checkoutFingerprint(input));
        expect(checkoutFingerprint(input)).not.toBe(checkoutFingerprint(checkoutSchema.parse({
            shippingAddress: { ...address, district: "Besiktas" },
        })));
    });
});

describe("Checkout HTTP boundaries (database-free)", () => {
    it("rejects checkout without CSRF", async () => {
        const res = await request(app).post("/api/v1/checkout");
        expect(res.status).toBe(403);
    });
    it("rejects order mutations without an authenticated session", async () => {
        const res = await request(app).post("/api/v1/orders/550e8400-e29b-41d4-a716-446655440000/demo-payment");
        expect(res.status).toBe(401);
    });
    it("rejects admin order reads without login", async () => {
        const res = await request(app).get("/api/v1/admin/orders");
        expect(res.status).toBe(401);
    });
});
