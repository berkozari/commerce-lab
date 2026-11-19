import { z } from "zod";

export const shippingSchema = z.object({
    recipientName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(32),
    country: z.literal("TR"),
    city: z.string().trim().min(2).max(120),
    district: z.string().trim().min(2).max(120),
    addressLine: z.string().trim().min(10).max(500),
    postalCode: z.string().trim().max(20).optional(),
});
export type ShippingForm = z.infer<typeof shippingSchema>;
