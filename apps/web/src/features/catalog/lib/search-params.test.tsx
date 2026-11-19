import { describe, expect, it } from "vitest";
import { readFilters, updateFilterParams } from "./search-params";

describe("catalog URL state", () => {
    it("applies safe defaults for malformed query values", () => {
        const filters = readFilters(new URLSearchParams("page=-3&sort=unknown&minPrice=bad"));
        expect(filters.page).toBe(1);
        expect(filters.sort).toBe("newest");
        expect(filters.minPrice).toBeUndefined();
    });
    it("resets pagination when changing filters", () => {
        const updated = updateFilterParams(new URLSearchParams("page=4&sort=newest"), { q: "lamp" });
        expect(updated.get("page")).toBeNull();
        expect(updated.get("q")).toBe("lamp");
    });
    it("retains a validated price range", () => {
        const filters = readFilters(new URLSearchParams("minPrice=120.50&maxPrice=900&sort=price-asc"));
        expect(filters.minPrice).toBe("120.50");
        expect(filters.maxPrice).toBe("900");
        expect(filters.sort).toBe("price-asc");
    });
});
