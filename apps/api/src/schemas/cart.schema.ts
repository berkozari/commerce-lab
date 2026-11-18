import { z } from "zod";

export const cartItemCreateSchema = z.strictObject({
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(100),
});

export const cartItemUpdateSchema = z.strictObject({
    quantity: z.number().int().min(1).max(100),
});

export const cartItemIdSchema = z.uuid();

export type CartItemCreateInput = z.infer<typeof cartItemCreateSchema>;
export type CartItemUpdateInput = z.infer<typeof cartItemUpdateSchema>;
