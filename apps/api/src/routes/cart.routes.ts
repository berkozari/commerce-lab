import { Router } from "express";
import { cartService } from "../services/cart.service.js";
import { cartItemCreateSchema, cartItemIdSchema, cartItemUpdateSchema } from "../schemas/cart.schema.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { requireCsrf } from "../middlewares/csrf.middleware.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getCartIdentity, resolveCartIdentity } from "../middlewares/cart-identity.middleware.js";
import { clearGuestCartCookie, guestTokenHash, readGuestToken } from "../lib/cart-cookie.js";

export const cartRouter = Router();

cartRouter.use(resolveCartIdentity);
cartRouter.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });

cartRouter.get("/", async (_req, res) => {
    res.json({ success: true, data: await cartService.get(getCartIdentity(res.locals)) });
});

cartRouter.post("/items", requireCsrf, validateBody(cartItemCreateSchema), async (req, res) => {
    res.status(201).json({ success: true, data: await cartService.addItem(getCartIdentity(res.locals), req.body) });
});

cartRouter.patch("/items/:itemId", requireCsrf, validateBody(cartItemUpdateSchema), async (req, res) => {
    const itemId = cartItemIdSchema.parse(req.params.itemId);
    res.json({ success: true, data: await cartService.setQuantity(getCartIdentity(res.locals), itemId, req.body.quantity) });
});

cartRouter.delete("/items/:itemId", requireCsrf, async (req, res) => {
    const itemId = cartItemIdSchema.parse(req.params.itemId);
    res.json({ success: true, data: await cartService.removeItem(getCartIdentity(res.locals), itemId) });
});

cartRouter.delete("/", requireCsrf, async (_req, res) => {
    res.json({ success: true, data: await cartService.clear(getCartIdentity(res.locals)) });
});

// Explicit merge after login; a failed merge does not modify either cart or clear the guest cookie.
cartRouter.post("/merge", requireCsrf, requireAuth, async (req, res) => {
    const guestToken = readGuestToken(req);
    const data = await cartService.merge(req.auth!.user.id, guestToken ? guestTokenHash(guestToken) : undefined);
    clearGuestCartCookie(res);
    res.json({ success: true, data });
});
