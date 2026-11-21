// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../../../src/pages/login-page";
import { RegisterPage } from "../../../src/pages/register-page";
import { ApiError } from "../../../src/lib/api-client";

const mocks = vi.hoisted(() => ({
    login: vi.fn(), register: vi.fn(), currentUser: vi.fn(),
    loginSubmit: vi.fn(), registerSubmit: vi.fn(),
}));
vi.mock("../../../src/features/auth/hooks/use-auth", () => ({
    useLogin: mocks.login,
    useRegister: mocks.register,
    useCurrentUser: mocks.currentUser,
}));

const demoUser = { id: "customer-1", name: "Demo User", email: "demo@example.com", role: "CUSTOMER" };
afterEach(cleanup);
beforeEach(() => {
    vi.clearAllMocks();
    mocks.loginSubmit.mockResolvedValue(demoUser);
    mocks.registerSubmit.mockResolvedValue(demoUser);
    mocks.login.mockReturnValue({ mutateAsync: mocks.loginSubmit, isPending: false, isError: false, error: null });
    mocks.register.mockReturnValue({ mutateAsync: mocks.registerSubmit, isPending: false, isError: false, error: null });
    mocks.currentUser.mockReturnValue({ data: null });
});

function view(path: "/login" | "/register", from?: unknown) {
    return render(<MemoryRouter initialEntries={[{ pathname: path, state: from === undefined ? null : { from } }]}>
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/account" element={<h1>Account destination</h1>} />
            <Route path="/checkout" element={<h1>Checkout destination</h1>} />
        </Routes>
    </MemoryRouter>);
}

function loginCredentials() {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "demo@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "correct-password" } });
}
function registration() {
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Demo User" } });
    loginCredentials();
}

describe("LoginPage", () => {
    it("rejects invalid input without calling the login mutation", async () => {
        view("/login");
        fireEvent.change(screen.getByLabelText("Email"), { target: { value: "invalid" } });
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByText("Enter a valid email address")).toBeTruthy();
        expect(mocks.loginSubmit).not.toHaveBeenCalled();
    });
    it("submits credentials and returns to a preserved checkout path", async () => {
        view("/login", "/checkout");
        loginCredentials();
        fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
        await waitFor(() => expect(mocks.loginSubmit).toHaveBeenCalledWith({ email: "demo@example.com", password: "correct-password" }));
        expect(await screen.findByRole("heading", { name: "Checkout destination" })).toBeTruthy();
    });
    it("shows an API error without navigating", () => {
        mocks.login.mockReturnValue({ mutateAsync: mocks.loginSubmit, isPending: false, isError: true, error: new ApiError(401, "Incorrect credentials") });
        view("/login");
        expect(screen.getByRole("alert").textContent).toContain("Incorrect credentials");
    });
    it("disables the submit button during login", () => {
        mocks.login.mockReturnValue({ mutateAsync: mocks.loginSubmit, isPending: true, isError: false });
        view("/login");
        expect((screen.getByRole("button", { name: "Signing in…" }) as HTMLButtonElement).disabled).toBe(true);
    });
    it("shows a session banner for an already signed-in account", () => {
        mocks.currentUser.mockReturnValue({ data: demoUser });
        view("/login");
        expect(screen.getByText(/signed in as demo@example\.com/)).toBeTruthy();
    });
});

describe("RegisterPage", () => {
    it("requires a valid name, email, and password before registering", async () => {
        view("/register");
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByText("Name must be at least 2 characters")).toBeTruthy();
        expect(mocks.registerSubmit).not.toHaveBeenCalled();
    });
    it("submits a valid registration and navigates to the return path", async () => {
        view("/register", "/checkout");
        registration();
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));
        await waitFor(() => expect(mocks.registerSubmit).toHaveBeenCalledWith({ name: "Demo User", email: "demo@example.com", password: "correct-password" }));
        expect(await screen.findByRole("heading", { name: "Checkout destination" })).toBeTruthy();
    });
    it("does not allow a protocol-relative return URL", async () => {
        view("/register", "//attacker.example");
        registration();
        fireEvent.click(screen.getByRole("button", { name: "Create account" }));
        expect(await screen.findByRole("heading", { name: "Account destination" })).toBeTruthy();
    });
    it("shows a registration API error and disables its pending action", () => {
        mocks.register.mockReturnValue({ mutateAsync: mocks.registerSubmit, isPending: true, isError: true, error: new ApiError(409, "Email already exists") });
        view("/register");
        expect(screen.getByRole("alert").textContent).toContain("Email already exists");
        expect((screen.getByRole("button", { name: "Creating account…" }) as HTMLButtonElement).disabled).toBe(true);
    });
});
