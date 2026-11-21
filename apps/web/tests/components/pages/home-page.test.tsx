import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "../../../src/pages/home-page";

vi.mock("../../../src/features/catalog/hooks/use-catalog", () => ({
    useCategories: () => ({ isPending: false, isError: false, data: [] }),
    useProducts: () => ({ isPending: false, isError: false, data: { items: [], pagination: { page: 1, limit: 6, total: 0, totalPages: 0 } } }),
}));

describe("HomePage", () => {
    it("links to the product catalog and renders storefront sections", () => {
        render(<MemoryRouter><HomePage /></MemoryRouter>);
        expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
        expect(screen.getByRole("link", { name: /shop the collection/i }).getAttribute("href")).toBe("/products");
        expect(screen.getByRole("heading", { name: /browse by category/i })).toBeTruthy();
    });
});
