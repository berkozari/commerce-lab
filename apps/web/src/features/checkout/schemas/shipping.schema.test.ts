import { describe, expect, it } from "vitest";
import { shippingSchema } from "./shipping.schema";

const valid = {
    recipientName: "Demo Customer", phone: "05550001122", country: "TR" as const,
    city: "Istanbul", district: "Kadikoy", addressLine: "Demo Street Number 10", postalCode: "34000",
};
describe("checkout form validation", () => {
    it("accepts a valid demo address", () => {
        expect(shippingSchema.safeParse(valid).success).toBe(true);
    });
    it("rejects missing or short address", () => {
        expect(shippingSchema.safeParse({ ...valid, addressLine: "short" }).success).toBe(false);
    });
    it("rejects unsupported shipping country", () => {
        expect(shippingSchema.safeParse({ ...valid, country: "US" }).success).toBe(false);
    });
});
