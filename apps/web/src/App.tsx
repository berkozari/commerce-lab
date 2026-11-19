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
        { element: <ProtectedRoute />, children: [{ path: "/account", element: <AccountPage /> }] },
        { path: "*", element: <NotFoundPage /> },
    ],
}]);

export function App() { return <RouterProvider router={router} />; }
