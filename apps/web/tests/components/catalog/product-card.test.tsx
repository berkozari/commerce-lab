// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { formatPrice, type Product } from "../../../src/features/catalog/api/catalog";
import { ProductCard } from "../../../src/features/catalog/components/product-card";

afterEach(cleanup);

const firstVariant: Product["variants"][number] = {
    id: "variant-1", sku: "BAG-001", name: "Standard", price: "1299.00", currency: "TRY",
    attributes: {}, isActive: true,
};
const secondVariant: Product["variants"][number] = {
    id: "variant-2", sku: "BAG-002", name: "Compact", price: "899.00", currency: "TRY",
    attributes: {}, isActive: true,
};

function makeProduct(overrides: Partial<Product> = {}): Product {
    return {
        id: "product-1",
        slug: "linen-backpack",
        name: "Linen Backpack",
        description: "Everyday bag",
        categoryId: "category-1",
        category: { id: "category-1", name: "Accessories", slug: "accessories" },
        images: [{ id: "image-1", url: "/backpack.jpg", altText: "Backpack on a shelf", position: 0 }],
        variants: [firstVariant],
        createdAt: "2026-11-20T00:00:00.000Z",
        ...overrides,
    };
}

function renderCard(product: Product = makeProduct()) {
    return render(<MemoryRouter><ProductCard product={product} /></MemoryRouter>);
}

describe("ProductCard", () => {
    it("provides an accessible product link to the correct slug", () => {
        renderCard();
        expect(screen.getByRole("link", { name: "View Linen Backpack" }).getAttribute("href"))
            .toBe("/products/linen-backpack");
        expect(screen.getByRole("heading", { name: "Linen Backpack" })).toBeTruthy();
        expect(screen.getByText("Accessories")).toBeTruthy();
    });

    it("displays the lowest variant price rather than the first variant price", () => {
        renderCard(makeProduct({ variants: [firstVariant, secondVariant] }));
        expect(screen.getByText(formatPrice(secondVariant.price, secondVariant.currency))).toBeTruthy();
        expect(screen.queryByText(formatPrice(firstVariant.price, firstVariant.currency))).toBeNull();
    });

    it("shows the options count only when there are multiple variants", () => {
        const single = renderCard();
        expect(screen.queryByText(/options available/i)).toBeNull();
        single.unmount();
        renderCard(makeProduct({ variants: [firstVariant, secondVariant] }));
        expect(screen.getByText("2 options available")).toBeTruthy();
    });

    it("uses the image alt text and lazy loading", () => {
        renderCard();
        const image = screen.getByRole("img", { name: "Backpack on a shelf" });
        expect(image.getAttribute("src")).toBe("/backpack.jpg");
        expect(image.getAttribute("loading")).toBe("lazy");
    });

    it("falls back to the product name when image alt text is missing", () => {
        renderCard(makeProduct({ images: [{ id: "image-2", url: "/alt.jpg", altText: null, position: 0 }] }));
        expect(screen.getByRole("img", { name: "Linen Backpack" })).toBeTruthy();
    });

    it("renders image and price fallbacks for a product with no images or variants", () => {
        renderCard(makeProduct({ images: [], variants: [] }));
        expect(screen.getByText("Image coming soon")).toBeTruthy();
        expect(screen.getByText("Price unavailable")).toBeTruthy();
        expect(screen.queryByRole("img")).toBeNull();
    });
});
