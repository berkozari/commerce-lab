import { Prisma } from "../../src/generated/prisma/client.js";
import type { CartWithItems } from "../../src/repositories/cart.repository.js";

export function cartFixtureItem(variantId: string, quantity: number): CartWithItems["items"][number] {
    return {
        id: `item-${variantId}`,
        variantId,
        quantity,
        variant: {
            name: "Standard",
            sku: `SKU-${variantId}`,
            price: new Prisma.Decimal("12.50"),
            currency: "TRY",
            isActive: true,
            product: {
                id: "fixture-product",
                name: "Fixture product",
                slug: "fixture-product",
                status: "ACTIVE",
            },
            inventory: { quantity: 200 },
        },
    } as unknown as CartWithItems["items"][number];
}

export function cartFixture(id: string, items: CartWithItems["items"] = []): CartWithItems {
    return { id, items } as unknown as CartWithItems;
}
