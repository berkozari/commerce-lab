import { z } from "zod";

export const loginFormSchema = z.object({
    email: z.email("Enter a valid email address"),
    password: z.string().min(1, "Password is required"),
});

export const registerFormSchema = z.object({
    name: z.string().trim().min(2, "Name must be at least 2 characters").max(100, "Name is too long"),
    email: z.email("Enter a valid email address"),
    password: z.string().min(10, "Password must be at least 10 characters").max(128, "Password is too long"),
});
