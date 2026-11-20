import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SiteLayout } from "./components/layout/site-layout";
import { ProtectedRoute } from "./features/auth/components/protected-route";

// Keep the shared layout and auth guard in the initial bundle. Load each page
// only when its route is rendered; protected pages remain behind ProtectedRoute.
const HomePage = lazy(() => import("./pages/home-page").then(({ HomePage }) => ({ default: HomePage })));
const ProductListPage = lazy(() => import("./pages/product-list-page").then(({ ProductListPage }) => ({ default: ProductListPage })));
const ProductDetailPage = lazy(() => import("./pages/product-detail-page").then(({ ProductDetailPage }) => ({ default: ProductDetailPage })));
const SystemPage = lazy(() => import("./pages/system-page").then(({ SystemPage }) => ({ default: SystemPage })));
const NotFoundPage = lazy(() => import("./pages/not-found-page").then(({ NotFoundPage }) => ({ default: NotFoundPage })));
const LoginPage = lazy(() => import("./pages/login-page").then(({ LoginPage }) => ({ default: LoginPage })));
const RegisterPage = lazy(() => import("./pages/register-page").then(({ RegisterPage }) => ({ default: RegisterPage })));
const AccountPage = lazy(() => import("./pages/account-page").then(({ AccountPage }) => ({ default: AccountPage })));
const CartPage = lazy(() => import("./pages/cart-page").then(({ CartPage }) => ({ default: CartPage })));
const CheckoutPage = lazy(() => import("./pages/checkout-page").then(({ CheckoutPage }) => ({ default: CheckoutPage })));
const OrderConfirmationPage = lazy(() => import("./pages/order-confirmation-page").then(({ OrderConfirmationPage }) => ({ default: OrderConfirmationPage })));
const OrdersPage = lazy(() => import("./pages/orders-page").then(({ OrdersPage }) => ({ default: OrdersPage })));

function page(element: ReactNode) {
    return <Suspense fallback={<div role="status" className="mx-auto max-w-6xl px-5 py-12 text-muted sm:px-8">Loading page…</div>}>
        {element}
    </Suspense>;
}

export const router = createBrowserRouter([{
    element: <SiteLayout />,
    children: [
        { path: "/", element: page(<HomePage />) },
        { path: "/products", element: page(<ProductListPage />) },
        { path: "/products/:slug", element: page(<ProductDetailPage />) },
        { path: "/categories/:slug", element: page(<ProductListPage categoryPage />) },
        { path: "/system", element: page(<SystemPage />) },
        { path: "/login", element: page(<LoginPage />) },
        { path: "/register", element: page(<RegisterPage />) },
        { path: "/cart", element: page(<CartPage />) },
        {
            element: <ProtectedRoute />, children: [
                { path: "/account", element: page(<AccountPage />) },
                { path: "/checkout", element: page(<CheckoutPage />) },
                { path: "/orders", element: page(<OrdersPage />) },
                { path: "/orders/:id", element: page(<OrderConfirmationPage />) },
            ]
        },
        { path: "*", element: page(<NotFoundPage />) },
    ],
}]);

export function App() { return <RouterProvider router={router} />; }
