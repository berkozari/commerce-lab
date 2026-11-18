import { Router } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { requireCsrf } from "../middlewares/csrf.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import {
    checkoutSchema, demoPaymentSchema, adminOrderStatusSchema,
    idempotencyKeySchema, orderIdSchema, orderListQuerySchema,
} from "../schemas/checkout.schema.js";
import { orderService } from "../services/order.service.js";
import { AppError } from "../utils/app-error.js";

export const checkoutRouter = Router();
export const ordersRouter = Router();
export const adminOrdersRouter = Router();

checkoutRouter.post("/", requireCsrf, requireAuth, validateBody(checkoutSchema), async (req, res) => {
    const rawKey = req.get("idempotency-key");
    if (!rawKey) throw new AppError("Idempotency-Key header is required", 400);
    const key = idempotencyKeySchema.parse(rawKey);
    const result = await orderService.checkout(req.auth!.user.id, req.body, key);
    res.status(result.replayed ? 200 : 201).json({ success: true, data: result });
});

ordersRouter.use(requireAuth);
ordersRouter.get("/", async (req, res) => {
    const query = orderListQuerySchema.parse(req.query);
    res.json({ success: true, data: await orderService.listMine(req.auth!.user.id, query) });
});
ordersRouter.get("/:id", async (req, res) => {
    res.json({ success: true, data: await orderService.getMine(req.auth!.user.id, orderIdSchema.parse(req.params.id)) });
});
ordersRouter.post("/:id/demo-payment", requireCsrf, validateBody(demoPaymentSchema), async (req, res) => {
    res.json({ success: true, data: await orderService.demoPayment(req.auth!.user.id, orderIdSchema.parse(req.params.id), req.body) });
});

adminOrdersRouter.use(requireAuth, requireRole("ADMIN"));
adminOrdersRouter.get("/", async (req, res) => {
    res.json({ success: true, data: await orderService.listAdmin(orderListQuerySchema.parse(req.query)) });
});
adminOrdersRouter.patch("/:id/status", requireCsrf, validateBody(adminOrderStatusSchema), async (req, res) => {
    res.json({ success: true, data: await orderService.adminUpdateStatus(orderIdSchema.parse(req.params.id), req.body) });
});
