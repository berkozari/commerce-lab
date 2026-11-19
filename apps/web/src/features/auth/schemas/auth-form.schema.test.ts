import { describe, expect, it } from "vitest";
import { loginFormSchema, registerFormSchema } from "./auth-form.schema";

describe("auth form schemas", () => {
    it("rejects malformed emails and empty passwords", () => {
        expect(loginFormSchema.safeParse({ email: "not-an-email", password: "a" }).success).toBe(false);
        expect(loginFormSchema.safeParse({ email: "customer@example.com", password: "" }).success).toBe(false);
        expect(loginFormSchema.safeParse({ email: "customer@example.com", password: "something" }).success).toBe(true);
    });
    it("validates registration fields", () => {
        expect(registerFormSchema.safeParse({ name: "A", email: "a@example.com", password: "averylongpassword" }).success).toBe(false);
        expect(registerFormSchema.safeParse({ name: "Customer", email: "a@example.com", password: "short" }).success).toBe(false);
        expect(registerFormSchema.safeParse({ name: "Customer", email: "a@example.com", password: "averylongpassword" }).success).toBe(true);
    });
});
