import { z } from "zod";

export const uuid = z.uuid();
const slug = z.string().trim().min(2).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const sku = z.string().trim().min(2).max(80).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
const money = z.string().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/, "Use a nonnegative decimal with up to 2 fractional digits");
const nonnegativeInt = z.number().int().min(0);
const attributes = z.record(z.string(), z.union([z.string(), z.number(), z.boolean()]));

export const categoryCreateSchema = z.strictObject({
    name: z.string().trim().min(2).max(100), slug: slug.max(120), parentId: uuid.nullable().optional(),
});
export const categoryUpdateSchema = categoryCreateSchema.partial().refine((v) => Object.keys(v).length > 0, "No changes supplied");

export const productCreateSchema = z.strictObject({
    categoryId: uuid, name: z.string().trim().min(2).max(180), slug,
    description: z.string().trim().max(20000).nullable().optional(),
    status: z.literal("DRAFT").default("DRAFT"),
});
export const productUpdateSchema = productCreateSchema.omit({ status: true }).partial()
    .extend({ status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional() })
    .refine((v) => Object.keys(v).length > 0, "No changes supplied");

export const variantCreateSchema = z.strictObject({
    sku, name: z.string().trim().min(1).max(120), price: money,
    currency: z.literal("TRY").default("TRY"), attributes: attributes.default({}),
    isActive: z.boolean().default(true), quantity: nonnegativeInt.default(0),
});
export const variantUpdateSchema = variantCreateSchema.omit({ quantity: true }).partial()
    .refine((v) => Object.keys(v).length > 0, "No changes supplied");

export const imageCreateSchema = z.strictObject({
    url: z.url().max(2048).refine((v) => v.startsWith("https://") || v.startsWith("http://"), "HTTP(S) URL required"),
    altText: z.string().trim().max(250).nullable().optional(), position: nonnegativeInt.default(0),
});
export const imageUpdateSchema = imageCreateSchema.partial().refine((v) => Object.keys(v).length > 0, "No changes supplied");
export const stockUpdateSchema = z.strictObject({ quantity: nonnegativeInt });

export const listProductsQuerySchema = z.strictObject({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    q: z.string().trim().min(1).max(100).optional(),
    categoryId: uuid.optional(),
    sort: z.enum(["newest", "oldest", "name-asc", "name-desc"]).default("newest"),
});
export const adminListProductsQuerySchema = listProductsQuerySchema.extend({ status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional() });
export const listCategoriesQuerySchema = z.strictObject({ parentId: uuid.optional() });

export type ProductListQuery = z.infer<typeof listProductsQuerySchema>;
export type AdminProductListQuery = z.infer<typeof adminListProductsQuerySchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type VariantCreateInput = z.infer<typeof variantCreateSchema>;
export type VariantUpdateInput = z.infer<typeof variantUpdateSchema>;
export type ImageCreateInput = z.infer<typeof imageCreateSchema>;
export type ImageUpdateInput = z.infer<typeof imageUpdateSchema>;
