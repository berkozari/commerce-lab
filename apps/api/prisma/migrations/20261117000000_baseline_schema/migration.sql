-- EC-013.1: baseline for databases created from scratch.
-- MUST precede init_ecommerce. Existing databases must mark this migration as applied,
-- NOT execute it against already-created tables. Do not modify prior migrations.

-- TYPE: OrderStatus
CREATE TYPE public."OrderStatus" AS ENUM (
    'PENDING',
    'CONFIRMED',
    'PROCESSING',
    'SHIPPED',
    'DELIVERED',
    'CANCELLED'
);

-- TYPE: PaymentStatus
CREATE TYPE public."PaymentStatus" AS ENUM (
    'UNPAID',
    'PAID_DEMO',
    'REFUNDED_DEMO'
);

-- TYPE: ProductStatus
CREATE TYPE public."ProductStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ARCHIVED'
);

-- TYPE: UserRole
CREATE TYPE public."UserRole" AS ENUM (
    'CUSTOMER',
    'ADMIN'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

-- TABLE: Address
CREATE TABLE public."Address" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    label character varying(80) NOT NULL,
    "recipientName" character varying(120) NOT NULL,
    phone character varying(32) NOT NULL,
    country character varying(2) DEFAULT 'TR'::character varying NOT NULL,
    city character varying(120) NOT NULL,
    district character varying(120) NOT NULL,
    "addressLine" character varying(500) NOT NULL,
    "postalCode" character varying(20),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: Cart
CREATE TABLE public."Cart" (
    id uuid NOT NULL,
    "userId" uuid,
    "guestTokenHash" character varying(128),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: CartItem
CREATE TABLE public."CartItem" (
    id uuid NOT NULL,
    "cartId" uuid NOT NULL,
    "variantId" uuid NOT NULL,
    quantity integer NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: Category
CREATE TABLE public."Category" (
    id uuid NOT NULL,
    name character varying(100) NOT NULL,
    slug character varying(120) NOT NULL,
    "parentId" uuid,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: Inventory
CREATE TABLE public."Inventory" (
    id uuid NOT NULL,
    "variantId" uuid NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: Order
CREATE TABLE public."Order" (
    id uuid NOT NULL,
    "userId" uuid NOT NULL,
    "orderNumber" character varying(40) NOT NULL,
    status public."OrderStatus" DEFAULT 'PENDING'::public."OrderStatus" NOT NULL,
    "paymentStatus" public."PaymentStatus" DEFAULT 'UNPAID'::public."PaymentStatus" NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    "shippingAmount" numeric(12,2) NOT NULL,
    total numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'TRY'::character varying NOT NULL,
    "shippingAddressSnapshot" jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: OrderItem
CREATE TABLE public."OrderItem" (
    id uuid NOT NULL,
    "orderId" uuid NOT NULL,
    "variantId" uuid,
    "productName" character varying(180) NOT NULL,
    sku character varying(80) NOT NULL,
    quantity integer NOT NULL,
    "unitPrice" numeric(12,2) NOT NULL,
    "totalPrice" numeric(12,2) NOT NULL
);

-- TABLE: Product
CREATE TABLE public."Product" (
    id uuid NOT NULL,
    "categoryId" uuid NOT NULL,
    name character varying(180) NOT NULL,
    slug character varying(200) NOT NULL,
    description text,
    status public."ProductStatus" DEFAULT 'DRAFT'::public."ProductStatus" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: ProductImage
CREATE TABLE public."ProductImage" (
    id uuid NOT NULL,
    "productId" uuid NOT NULL,
    url character varying(2048) NOT NULL,
    "altText" character varying(250),
    "position" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- TABLE: ProductVariant
CREATE TABLE public."ProductVariant" (
    id uuid NOT NULL,
    "productId" uuid NOT NULL,
    sku character varying(80) NOT NULL,
    name character varying(120) NOT NULL,
    price numeric(12,2) NOT NULL,
    currency character varying(3) DEFAULT 'TRY'::character varying NOT NULL,
    attributes jsonb DEFAULT '{}'::jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- TABLE: User
CREATE TABLE public."User" (
    id uuid NOT NULL,
    email character varying(254) NOT NULL,
    "passwordHash" text NOT NULL,
    name character varying(120) NOT NULL,
    role public."UserRole" DEFAULT 'CUSTOMER'::public."UserRole" NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);

-- CONSTRAINT: Address Address_pkey
ALTER TABLE ONLY public."Address"
    ADD CONSTRAINT "Address_pkey" PRIMARY KEY (id);

-- CONSTRAINT: CartItem CartItem_pkey
ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_pkey" PRIMARY KEY (id);

-- CONSTRAINT: Cart Cart_pkey
ALTER TABLE ONLY public."Cart"
    ADD CONSTRAINT "Cart_pkey" PRIMARY KEY (id);

-- CONSTRAINT: Category Category_pkey
ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_pkey" PRIMARY KEY (id);

-- CONSTRAINT: Inventory Inventory_pkey
ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_pkey" PRIMARY KEY (id);

-- CONSTRAINT: OrderItem OrderItem_pkey
ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_pkey" PRIMARY KEY (id);

-- CONSTRAINT: Order Order_pkey
ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_pkey" PRIMARY KEY (id);

-- CONSTRAINT: ProductImage ProductImage_pkey
ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_pkey" PRIMARY KEY (id);

-- CONSTRAINT: ProductVariant ProductVariant_pkey
ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_pkey" PRIMARY KEY (id);

-- CONSTRAINT: Product Product_pkey
ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_pkey" PRIMARY KEY (id);

-- CONSTRAINT: User User_pkey
ALTER TABLE ONLY public."User"
    ADD CONSTRAINT "User_pkey" PRIMARY KEY (id);

-- INDEX: Address_userId_idx
CREATE INDEX "Address_userId_idx" ON public."Address" USING btree ("userId");

-- INDEX: CartItem_cartId_variantId_key
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON public."CartItem" USING btree ("cartId", "variantId");

-- INDEX: CartItem_variantId_idx
CREATE INDEX "CartItem_variantId_idx" ON public."CartItem" USING btree ("variantId");

-- INDEX: Cart_guestTokenHash_key
CREATE UNIQUE INDEX "Cart_guestTokenHash_key" ON public."Cart" USING btree ("guestTokenHash");

-- INDEX: Cart_userId_idx
CREATE INDEX "Cart_userId_idx" ON public."Cart" USING btree ("userId");

-- INDEX: Category_parentId_idx
CREATE INDEX "Category_parentId_idx" ON public."Category" USING btree ("parentId");

-- INDEX: Category_slug_key
CREATE UNIQUE INDEX "Category_slug_key" ON public."Category" USING btree (slug);

-- INDEX: Inventory_variantId_key
CREATE UNIQUE INDEX "Inventory_variantId_key" ON public."Inventory" USING btree ("variantId");

-- INDEX: OrderItem_orderId_idx
CREATE INDEX "OrderItem_orderId_idx" ON public."OrderItem" USING btree ("orderId");

-- INDEX: OrderItem_variantId_idx
CREATE INDEX "OrderItem_variantId_idx" ON public."OrderItem" USING btree ("variantId");

-- INDEX: Order_orderNumber_key
CREATE UNIQUE INDEX "Order_orderNumber_key" ON public."Order" USING btree ("orderNumber");

-- INDEX: Order_status_createdAt_idx
CREATE INDEX "Order_status_createdAt_idx" ON public."Order" USING btree (status, "createdAt");

-- INDEX: Order_userId_createdAt_idx
CREATE INDEX "Order_userId_createdAt_idx" ON public."Order" USING btree ("userId", "createdAt");

-- INDEX: ProductImage_productId_position_idx
CREATE INDEX "ProductImage_productId_position_idx" ON public."ProductImage" USING btree ("productId", "position");

-- INDEX: ProductVariant_productId_isActive_idx
CREATE INDEX "ProductVariant_productId_isActive_idx" ON public."ProductVariant" USING btree ("productId", "isActive");

-- INDEX: ProductVariant_sku_key
CREATE UNIQUE INDEX "ProductVariant_sku_key" ON public."ProductVariant" USING btree (sku);

-- INDEX: Product_categoryId_status_idx
CREATE INDEX "Product_categoryId_status_idx" ON public."Product" USING btree ("categoryId", status);

-- INDEX: Product_slug_key
CREATE UNIQUE INDEX "Product_slug_key" ON public."Product" USING btree (slug);

-- INDEX: Product_status_createdAt_idx
CREATE INDEX "Product_status_createdAt_idx" ON public."Product" USING btree (status, "createdAt");

-- INDEX: User_email_key
CREATE UNIQUE INDEX "User_email_key" ON public."User" USING btree (email);

-- FK CONSTRAINT: Address Address_userId_fkey
ALTER TABLE ONLY public."Address"
    ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- FK CONSTRAINT: CartItem CartItem_cartId_fkey
ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES public."Cart"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- FK CONSTRAINT: CartItem CartItem_variantId_fkey
ALTER TABLE ONLY public."CartItem"
    ADD CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FK CONSTRAINT: Cart Cart_userId_fkey
ALTER TABLE ONLY public."Cart"
    ADD CONSTRAINT "Cart_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- FK CONSTRAINT: Category Category_parentId_fkey
ALTER TABLE ONLY public."Category"
    ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FK CONSTRAINT: Inventory Inventory_variantId_fkey
ALTER TABLE ONLY public."Inventory"
    ADD CONSTRAINT "Inventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FK CONSTRAINT: OrderItem OrderItem_orderId_fkey
ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES public."Order"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FK CONSTRAINT: OrderItem OrderItem_variantId_fkey
ALTER TABLE ONLY public."OrderItem"
    ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES public."ProductVariant"(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FK CONSTRAINT: Order Order_userId_fkey
ALTER TABLE ONLY public."Order"
    ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES public."User"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FK CONSTRAINT: ProductImage ProductImage_productId_fkey
ALTER TABLE ONLY public."ProductImage"
    ADD CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE CASCADE;

-- FK CONSTRAINT: Product Product_categoryId_fkey
ALTER TABLE ONLY public."Product"
    ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public."Category"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FK CONSTRAINT: ProductVariant ProductVariant_productId_fkey
ALTER TABLE ONLY public."ProductVariant"
    ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES public."Product"(id) ON UPDATE CASCADE ON DELETE RESTRICT;

