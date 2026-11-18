import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./home-page";

describe("HomePage", () => {
    it("renders foundation content and a navigation link", () => {
        render(<MemoryRouter><HomePage /></MemoryRouter >);
        expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
        expect(screen.getByRole("link", { name: /check api connection/i }).getAttribute("href")).toBe("/system");
    });
});
