// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "../../../../src/features/auth/components/protected-route";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), refetch: vi.fn() }));
vi.mock("../../../../src/features/auth/hooks/use-auth", () => ({ useCurrentUser: mocks.currentUser }));

afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentUser.mockReturnValue({ data: null, isPending: false, isError: false, refetch: mocks.refetch });
});

function LoginDestination() {
    const location = useLocation();
    return <><h1>Login destination</h1><output data-testid="login-origin">{JSON.stringify(location.state)}</output></>;
}

function view(role?: "ADMIN" | "CUSTOMER") {
    return render(<MemoryRouter initialEntries={["/account?tab=orders"]}>
        <Routes>
            <Route path="/account" element={<ProtectedRoute role={role} />}>
                <Route index element={<h1>Private account</h1>} />
            </Route>
            <Route path="/login" element={<LoginDestination />} />
        </Routes>
    </MemoryRouter>);
}

describe("ProtectedRoute", () => {
    it("shows a session-checking status while pending", () => {
        mocks.currentUser.mockReturnValue({ isPending: true, isError: false });
        view();
        expect(screen.getByRole("status").textContent).toContain("Checking your session");
        expect(screen.queryByText("Private account")).toBeNull();
    });

    it("offers retry when session verification fails", () => {
        mocks.currentUser.mockReturnValue({ isPending: false, isError: true, refetch: mocks.refetch });
        view();
        expect(screen.getByRole("alert").textContent).toContain("Could not verify");
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        expect(mocks.refetch).toHaveBeenCalledTimes(1);
    });

    it("redirects anonymous users to login", () => {
        view();
        expect(screen.getByRole("heading", { name: "Login destination" })).toBeTruthy();
        expect(screen.queryByText("Private account")).toBeNull();
        expect(JSON.parse(screen.getByTestId("login-origin").textContent ?? "{}")).toEqual({ from: "/account?tab=orders" });
    });

    it("renders protected content for authenticated customers", () => {
        mocks.currentUser.mockReturnValue({ data: { id: "u-1", role: "CUSTOMER" }, isPending: false, isError: false });
        view();
        expect(screen.getByRole("heading", { name: "Private account" })).toBeTruthy();
    });

    it("denies admin-only content to a customer", () => {
        mocks.currentUser.mockReturnValue({ data: { id: "u-1", role: "CUSTOMER" }, isPending: false, isError: false });
        view("ADMIN");
        expect(screen.getByRole("alert").textContent).toContain("do not have permission");
        expect(screen.queryByText("Private account")).toBeNull();
    });

    it("allows admin-only content for an admin", () => {
        mocks.currentUser.mockReturnValue({ data: { id: "a-1", role: "ADMIN" }, isPending: false, isError: false });
        view("ADMIN");
        expect(screen.getByRole("heading", { name: "Private account" })).toBeTruthy();
    });
});
