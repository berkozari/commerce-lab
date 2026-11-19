import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SiteLayout } from "./components/layout/site-layout";
import { ProtectedRoute } from "./features/auth/components/protected-route";
import { HomePage } from "./pages/home-page";
import { ProductListPage } from "./pages/product-list-page";
import { ProductDetailPage } from "./pages/product-detail-page";
import { SystemPage } from "./pages/system-page";
import { NotFoundPage } from "./pages/not-found-page";
import { LoginPage } from "./pages/login-page";
import { RegisterPage } from "./pages/register-page";
import { AccountPage } from "./pages/account-page";
import { CartPage } from "./pages/cart-page";
import { CheckoutPage } from "./pages/checkout-page";
import { OrderConfirmationPage } from "./pages/order-confirmation-page";
import { OrdersPage } from "./pages/orders-page";

export const router = createBrowserRouter([{
    element: <SiteLayout />,
    children: [
        { path: "/", element: <HomePage /> },
        { path: "/products", element: <ProductListPage /> },
        { path: "/products/:slug", element: <ProductDetailPage /> },
        { path: "/categories/:slug", element: <ProductListPage categoryPage /> },
        { path: "/system", element: <SystemPage /> },
        { path: "/login", element: <LoginPage /> },
        { path: "/register", element: <RegisterPage /> },
        { path: "/cart", element: <CartPage /> },
        {
            element: <ProtectedRoute />, children: [
                { path: "/account", element: <AccountPage /> },
                { path: "/checkout", element: <CheckoutPage /> },
                { path: "/orders", element: <OrdersPage /> },
                { path: "/orders/:id", element: <OrderConfirmationPage /> },
            ]
        },
        { path: "*", element: <NotFoundPage /> },
    ],
}]);

export function App() { return <RouterProvider router={router} />; }
