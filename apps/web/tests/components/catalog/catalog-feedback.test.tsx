// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    CatalogEmpty,
    CatalogError,
    CatalogLoading,
} from "../../../src/features/catalog/components/catalog-feedback";

afterEach(cleanup);

describe("CatalogFeedback", () => {
    it("exposes a default accessible loading status", () => {
        render(<CatalogLoading />);
        expect(screen.getByRole("status")).toBeTruthy();
        expect(screen.getByText("Loading products")).toBeTruthy();
    });

    it("supports a custom loading label and renders six placeholders", () => {
        const view = render(<CatalogLoading label="Loading featured products" />);
        expect(screen.getByText("Loading featured products")).toBeTruthy();
        expect(view.container.querySelectorAll(".animate-pulse")).toHaveLength(6);
    });

    it("shows a safe default error message", () => {
        render(<CatalogError retry={() => undefined} />);
        expect(screen.getByRole("alert")).toBeTruthy();
        expect(screen.getByText("Please try again in a moment.")).toBeTruthy();
    });

    it("displays a custom error message and invokes retry on click", () => {
        const retry = vi.fn();
        render(<CatalogError message="Catalog temporarily unavailable" retry={retry} />);
        expect(screen.getByText("Catalog temporarily unavailable")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        expect(retry).toHaveBeenCalledTimes(1);
    });

    it("hides the reset action when no callback is provided", () => {
        render(<CatalogEmpty />);
        expect(screen.getByRole("heading", { name: "No products found" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: /clear filters/i })).toBeNull();
    });

    it("shows the reset action and invokes its callback", () => {
        const reset = vi.fn();
        render(<CatalogEmpty reset={reset} />);
        fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));
        expect(reset).toHaveBeenCalledTimes(1);
    });
});
