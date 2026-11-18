import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { SiteLayout } from "./components/layout/site-layout";
import { HomePage } from "./pages/home-page";
import { SystemPage } from "./pages/system-page";
import { NotFoundPage } from "./pages/not-found-page";

export const router = createBrowserRouter([{
    element: <SiteLayout />,
    children: [
        { path: "/", element: <HomePage /> },
        { path: "/system", element: <SystemPage /> },
        { path: "*", element: <NotFoundPage /> },
    ],
}]);

export function App() {
    return <RouterProvider router={router} />;
}
