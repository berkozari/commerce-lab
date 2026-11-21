import { describe, expect, it } from "vitest";
import { imageUpdateSchema, variantUpdateSchema } from "../../src/schemas/catalog.schema.js";

describe("catalog partial update payloads", () => {
    it("does not inject creation defaults when disabling a variant", () => {
        expect(variantUpdateSchema.parse({ isActive: false })).toEqual({ isActive: false });
    });

    it("does not reactivate a variant or reset attributes on a price-only update", () => {
        expect(variantUpdateSchema.parse({ price: "45.90" })).toEqual({ price: "45.90" });
    });

    it("preserves fields explicitly supplied in a variant update", () => {
        expect(variantUpdateSchema.parse({ isActive: true, attributes: { size: "M" }, currency: "TRY" }))
            .toEqual({ isActive: true, attributes: { size: "M" }, currency: "TRY" });
    });

    it("does not reset an image position when updating only its alt text", () => {
        expect(imageUpdateSchema.parse({ altText: "Updated image" })).toEqual({ altText: "Updated image" });
    });

    it("preserves an explicitly supplied image position", () => {
        expect(imageUpdateSchema.parse({ position: 0 })).toEqual({ position: 0 });
    });
});
