import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
    throw new Error("DATABASE_URL is required for seeding");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
    const categories = [
        { name: "Electronics", slug: "electronics" },
        { name: "Home & Living", slug: "home-living" },
        { name: "Accessories", slug: "accessories" },
    ];

    for (const category of categories) {
        await prisma.category.upsert({
            where: { slug: category.slug },
            update: { name: category.name },
            create: category,
        });
    }

    const catalog = [
        { category: "electronics", slug: "wireless-headphones", name: "Wireless Headphones", sku: "EL-HEAD-001", price: "2499.00", quantity: 18 },
        { category: "home-living", slug: "desk-lamp", name: "Desk Lamp", sku: "HM-LAMP-001", price: "899.00", quantity: 24 },
        { category: "accessories", slug: "canvas-backpack", name: "Canvas Backpack", sku: "AC-BAG-001", price: "1299.00", quantity: 12 },
    ];

    for (const item of catalog) {
        const category = await prisma.category.findUniqueOrThrow({ where: { slug: item.category } });
        const product = await prisma.product.upsert({
            where: { slug: item.slug },
            update: { name: item.name, categoryId: category.id, status: "ACTIVE" },
            create: { name: item.name, slug: item.slug, categoryId: category.id, status: "ACTIVE" },
        });
        const variant = await prisma.productVariant.upsert({
            where: { sku: item.sku },
            update: { productId: product.id, price: item.price, name: "Default" },
            create: { productId: product.id, sku: item.sku, name: "Default", price: item.price },
        });
        await prisma.inventory.upsert({
            where: { variantId: variant.id },
            update: {}, // Never overwrite stock on a repeated seed.
            create: { variantId: variant.id, quantity: item.quantity },
        });
    }

    console.info("CommerceLab development catalog seeded");
}

main()
    .catch((error: unknown) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
