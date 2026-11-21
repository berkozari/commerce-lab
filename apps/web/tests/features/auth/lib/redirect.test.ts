import { describe, expect, it } from "vitest";
import { safeReturnPath } from "../../../../src/features/auth/lib/redirect";

describe("safeReturnPath", () => {
    it("keeps relative app locations", () => {
        expect(safeReturnPath("/products?q=lamp")).toBe("/products?q=lamp");
    });
    it("rejects externally controlled destinations", () => {
        expect(safeReturnPath("https://example.org")).toBe("/account");
        expect(safeReturnPath("//example.org")).toBe("/account");
        expect(safeReturnPath(undefined)).toBe("/account");
    });
});
