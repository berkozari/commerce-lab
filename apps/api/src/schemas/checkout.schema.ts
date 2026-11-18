import { z } from "zod";

export const shippingAddressSchema = z.strictObject({
    recipientName: z.string().trim().min(2).max(120),
    phone: z.string().trim().min(7).max(32),
    country: z.literal("TR"),
    city: z.string().trim().min(2).max(120),
    district: z.string().trim().min(2).max(120),
    addressLine: z.string().trim().min(10).max(500),
    postalCode: z.string().trim().max(20).optional(),
});
export const checkoutSchema = z.strictObject({ shippingAddress: shippingAddressSchema });
export const demoPaymentSchema = z.strictObject({ outcome: z.enum(["success", "failure"]) });
export const adminOrderStatusSchema = z.strictObject({
    status: z.enum(["PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]),
});
export const orderIdSchema = z.uuid();
export const idempotencyKeySchema = z.string().min(16).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const orderListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type DemoPaymentInput = z.infer<typeof demoPaymentSchema>;
export type AdminOrderStatusInput = z.infer<typeof adminOrderStatusSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
