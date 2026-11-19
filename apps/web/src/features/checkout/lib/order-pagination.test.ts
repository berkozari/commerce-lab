import { describe, expect, it } from "vitest";
import { readOrderPage, totalOrderPages } from "./order-pagination";

describe("order pagination", () => {
    it("accepts positive integer pages", () => {
        expect(readOrderPage("1")).toBe(1);
        expect(readOrderPage("24")).toBe(24);
    });
    it("ignores invalid or unsafe page parameters", () => {
        for (const value of [null, "0", "-1", "1.5", "abc", "1e3", "99999999999999999999"]) {
            expect(readOrderPage(value)).toBe(1);
        }
    });
    it("calculates total pages and supports empty history", () => {
        expect(totalOrderPages(0, 10)).toBe(1);
        expect(totalOrderPages(21, 10)).toBe(3);
    });
});
