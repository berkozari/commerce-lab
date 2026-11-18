import { z } from "zod";

export const registerSchema = z.strictObject({
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254).transform((email) => email.toLowerCase()),
    password: z.string().min(12).max(128),
});

export const loginSchema = z.strictObject({
    email: z.email().max(254).transform((email) => email.toLowerCase()),
    password: z.string().min(1),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
