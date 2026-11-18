import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth.middleware.js";
import { requireCsrf } from "../middlewares/csrf.middleware.js";
import { validateBody } from "../middlewares/validate.middleware.js";
import { catalogService } from "../services/catalog.service.js";
import {
    uuid, listCategoriesQuerySchema, listProductsQuerySchema, adminListProductsQuerySchema,
    categoryCreateSchema, categoryUpdateSchema, productCreateSchema, productUpdateSchema,
    variantCreateSchema, variantUpdateSchema, imageCreateSchema, imageUpdateSchema, stockUpdateSchema,
} from "../schemas/catalog.schema.js";

export const catalogRouter = Router();
export const adminCatalogRouter = Router();

const id = (value: unknown): string => uuid.parse(value);
const slug = (value: unknown): string => z.string().min(2).max(200).parse(value);
const adminOnly = [requireAuth, requireRole("ADMIN"), requireCsrf] as const;

catalogRouter.get("/categories", async (req, res) => {
    const query = listCategoriesQuerySchema.parse(req.query);
    res.json({ success: true, data: await catalogService.listCategories(query.parentId) });
});
catalogRouter.get("/products", async (req, res) => {
    const query = listProductsQuerySchema.parse(req.query);
    res.json({ success: true, data: await catalogService.listProducts(query) });
});
catalogRouter.get("/products/:slug", async (req, res) => {
    res.json({ success: true, data: await catalogService.getPublicProduct(slug(req.params.slug)) });
});

adminCatalogRouter.get("/products", requireAuth, requireRole("ADMIN"), async (req, res) => {
    const query = adminListProductsQuerySchema.parse(req.query);
    res.json({ success: true, data: await catalogService.listProducts(query, true, query.status) });
});
adminCatalogRouter.get("/products/:id", requireAuth, requireRole("ADMIN"), async (req, res) => {
    res.json({ success: true, data: await catalogService.getAdminProduct(id(req.params.id)) });
});
adminCatalogRouter.post("/categories", ...adminOnly, validateBody(categoryCreateSchema), async (req, res) => {
    res.status(201).json({ success: true, data: await catalogService.createCategory(req.body) });
});
adminCatalogRouter.patch("/categories/:id", ...adminOnly, validateBody(categoryUpdateSchema), async (req, res) => {
    res.json({ success: true, data: await catalogService.updateCategory(id(req.params.id), req.body) });
});
adminCatalogRouter.post("/products", ...adminOnly, validateBody(productCreateSchema), async (req, res) => {
    res.status(201).json({ success: true, data: await catalogService.createProduct(req.body) });
});
adminCatalogRouter.patch("/products/:id", ...adminOnly, validateBody(productUpdateSchema), async (req, res) => {
    res.json({ success: true, data: await catalogService.updateProduct(id(req.params.id), req.body) });
});
adminCatalogRouter.delete("/products/:id", ...adminOnly, async (req, res) => {
    res.json({ success: true, data: await catalogService.archiveProduct(id(req.params.id)) });
});
adminCatalogRouter.post("/products/:id/variants", ...adminOnly, validateBody(variantCreateSchema), async (req, res) => {
    res.status(201).json({ success: true, data: await catalogService.createVariant(id(req.params.id), req.body) });
});
adminCatalogRouter.patch("/products/:id/variants/:variantId", ...adminOnly, validateBody(variantUpdateSchema), async (req, res) => {
    res.json({ success: true, data: await catalogService.updateVariant(id(req.params.id), id(req.params.variantId), req.body) });
});
adminCatalogRouter.post("/products/:id/images", ...adminOnly, validateBody(imageCreateSchema), async (req, res) => {
    res.status(201).json({ success: true, data: await catalogService.addImage(id(req.params.id), req.body) });
});
adminCatalogRouter.patch("/products/:id/images/:imageId", ...adminOnly, validateBody(imageUpdateSchema), async (req, res) => {
    res.json({ success: true, data: await catalogService.updateImage(id(req.params.id), id(req.params.imageId), req.body) });
});
adminCatalogRouter.delete("/products/:id/images/:imageId", ...adminOnly, async (req, res) => {
    res.json({ success: true, data: await catalogService.deleteImage(id(req.params.id), id(req.params.imageId)) });
});
adminCatalogRouter.patch("/inventory/:variantId", ...adminOnly, validateBody(stockUpdateSchema), async (req, res) => {
    res.json({ success: true, data: await catalogService.setStock(id(req.params.variantId), req.body.quantity) });
});
