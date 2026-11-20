import { afterEach, describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { authApi, getCurrentUser } from "../api/auth";
import { announceAuthSessionChange, startAuthSessionSync } from "./session-coordination";

const user = { id: "user-1", name: "Demo", email: "demo@example.com", role: "CUSTOMER" };
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const unauthorized = () => ({ ok: false, status: 401, json: async () => ({ success: false, message: "Unauthorized" }) });

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("auth refresh coordination", () => {
    it("sends only one refresh for simultaneous 401s in one tab", async () => {
        const gate = deferred();
        let authenticated = false;
        let refreshCount = 0;
        const fetchMock = vi.fn(async (path: string) => {
            if (path === "/api/v1/auth/me") return authenticated ? ok({ user }) : unauthorized();
            if (path === "/api/v1/auth/csrf") return ok({ csrfToken: "csrf" });
            if (path === "/api/v1/auth/refresh") {
                refreshCount++;
                await gate.promise;
                authenticated = true;
                return ok({ user });
            }
            throw new Error(`Unexpected URL: ${path}`);
        });
        vi.stubGlobal("fetch", fetchMock);

        const results = [getCurrentUser(), getCurrentUser(), getCurrentUser()];
        await vi.waitFor(() => expect(refreshCount).toBe(1));
        gate.resolve();

        await expect(Promise.all(results)).resolves.toEqual([user, user, user]);
        expect(refreshCount).toBe(1);
    });

    it("does not allow logout to overtake an in-progress refresh", async () => {
        const gate = deferred();
        let authenticated = false;
        const order: string[] = [];
        vi.stubGlobal("fetch", vi.fn(async (path: string) => {
            if (path === "/api/v1/auth/me") return authenticated ? ok({ user }) : unauthorized();
            if (path === "/api/v1/auth/csrf") return ok({ csrfToken: "csrf" });
            if (path === "/api/v1/auth/refresh") {
                order.push("refresh-start");
                await gate.promise;
                authenticated = true;
                order.push("refresh-end");
                return ok({ user });
            }
            if (path === "/api/v1/auth/logout") {
                order.push("logout");
                return ok({ loggedOut: true });
            }
            throw new Error(`Unexpected URL: ${path}`);
        }));

        const recovery = getCurrentUser();
        await vi.waitFor(() => expect(order).toContain("refresh-start"));
        const logout = authApi.logout();
        expect(order).not.toContain("logout");
        gate.resolve();
        await recovery;
        await logout;
        expect(order).toEqual(["refresh-start", "refresh-end", "logout"]);
    });

    it("releases single-flight state after a transient server error", async () => {
        let csrfRequests = 0;
        let authenticated = false;
        vi.stubGlobal("fetch", vi.fn(async (path: string) => {
            if (path === "/api/v1/auth/me") return authenticated ? ok({ user }) : unauthorized();
            if (path === "/api/v1/auth/csrf") {
                csrfRequests++;
                return csrfRequests === 1
                    ? { ok: false, status: 503, json: async () => ({ success: false, message: "Unavailable" }) }
                    : ok({ csrfToken: "csrf" });
            }
            if (path === "/api/v1/auth/refresh") {
                authenticated = true;
                return ok({ user });
            }
            throw new Error(`Unexpected URL: ${path}`);
        }));

        await expect(getCurrentUser()).rejects.toMatchObject({ status: 503 });
        await expect(getCurrentUser()).resolves.toEqual(user);
        expect(csrfRequests).toBe(2);
    });

    it("uses a browser-wide Web Lock and rechecks /me after the other tab refreshes", async () => {
        // Separate module instances emulate separate tabs; the lock provider is shared.
        let lockQueue = Promise.resolve();
        const lockRequest = vi.fn((_name: string, _options: unknown, task: () => Promise<unknown>) => {
            const result = lockQueue.then(task);
            lockQueue = result.then(() => undefined, () => undefined);
            return result;
        });
        vi.stubGlobal("navigator", { locks: { request: lockRequest } });
        let authenticated = false;
        let refreshCount = 0;
        vi.stubGlobal("fetch", vi.fn(async (path: string) => {
            if (path === "/api/v1/auth/me") return authenticated ? ok({ user }) : unauthorized();
            if (path === "/api/v1/auth/csrf") return ok({ csrfToken: "csrf" });
            if (path === "/api/v1/auth/refresh") {
                refreshCount++;
                authenticated = true;
                return ok({ user });
            }
            throw new Error(`Unexpected URL: ${path}`);
        }));

        vi.resetModules();
        const tabOne = await import("../api/auth");
        vi.resetModules();
        const tabTwo = await import("../api/auth");
        await expect(Promise.all([tabOne.getCurrentUser(), tabTwo.getCurrentUser()])).resolves.toEqual([user, user]);
        expect(refreshCount).toBe(1);
        expect(lockRequest).toHaveBeenCalledTimes(2);
    });
});

describe("cross-tab auth state events", () => {
    it("broadcasts no personal data and resets queries in other tabs", () => {
        class FakeChannel {
            static instances: FakeChannel[] = [];
            onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
            posted: unknown[] = [];
            constructor() { FakeChannel.instances.push(this); }
            postMessage(data: unknown) {
                this.posted.push(data);
                FakeChannel.instances.filter(item => item !== this).forEach(item => item.onmessage?.({ data } as MessageEvent));
            }
            close() { FakeChannel.instances = FakeChannel.instances.filter(item => item !== this); }
        }
        vi.stubGlobal("BroadcastChannel", FakeChannel);
        const firstClient = { resetQueries: vi.fn().mockResolvedValue(undefined) } as unknown as QueryClient;
        const secondClient = { resetQueries: vi.fn().mockResolvedValue(undefined) } as unknown as QueryClient;
        const closeFirst = startAuthSessionSync(firstClient);
        const closeSecond = startAuthSessionSync(secondClient);

        announceAuthSessionChange();
        expect(firstClient.resetQueries).toHaveBeenCalledTimes(1);
        expect(secondClient.resetQueries).not.toHaveBeenCalled();
        expect(FakeChannel.instances[1].posted).toEqual([{ type: "session-changed" }]);

        FakeChannel.instances[0].onmessage?.({ data: { type: "unrelated" } } as MessageEvent);
        expect(firstClient.resetQueries).toHaveBeenCalledTimes(1);
        closeSecond();
        closeFirst();
    });
});
