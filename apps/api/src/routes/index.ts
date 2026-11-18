import { Router } from "express";
import { cartRouter } from "./cart.routes.js";
import { healthRouter } from "./health.routes.js";
import { authRouter } from "./auth.routes.js";
import { catalogRouter, adminCatalogRouter } from "./catalog.routes.js";
import { checkoutRouter, ordersRouter, adminOrdersRouter } from "./order.routes.js";

export const apiRouter = Router();
apiRouter.use("/health", healthRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use(catalogRouter);
apiRouter.use("/admin", adminCatalogRouter);

apiRouter.use("/cart", cartRouter);

apiRouter.use("/checkout", checkoutRouter);
apiRouter.use("/orders", ordersRouter);
apiRouter.use("/admin/orders", adminOrdersRouter);
