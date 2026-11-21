import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { validateBody } from "../../src/middlewares/validate.middleware.js";

describe("validateBody", () => {
    it("forwards Zod errors to central error handling", () => {
        const middleware = validateBody(z.object({ title: z.string().min(3) }));
        const request = { body: { title: "x" } } as Parameters<typeof middleware>[0];
        const next = vi.fn();
        middleware(request, {} as Parameters<typeof middleware>[1], next);
        expect(next).toHaveBeenCalledOnce();
        expect(next.mock.calls[0]?.[0]).toBeInstanceOf(z.ZodError);
    });
});
