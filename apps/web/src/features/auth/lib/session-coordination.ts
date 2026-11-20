import type { QueryClient } from "@tanstack/react-query";

const SESSION_LOCK_NAME = "commercelab:auth-session";
const SESSION_CHANNEL_NAME = "commercelab:auth-state";
const SESSION_CHANGED_EVENT = "session-changed";

// A promise queue prevents auth mutations and refresh from racing inside one tab.
// It also provides a safe fallback for browsers without the Web Locks API.
let localQueue: Promise<void> = Promise.resolve();

export function hasCrossTabSessionLock(): boolean {
    return typeof navigator !== "undefined" && typeof navigator.locks?.request === "function";
}

export function withAuthSessionLock<T>(
    operation: () => Promise<T>,
): Promise<T> {
    const run = async (): Promise<T> => {
        if (hasCrossTabSessionLock()) {
            return await navigator.locks.request(
                SESSION_LOCK_NAME,
                { mode: "exclusive" },
                async () => await operation(),
            );
        }

        return await operation();
    };

    const result = localQueue.then(run, run);
    localQueue = result.then(() => undefined, () => undefined);

    return result;
}

let sessionChannel: BroadcastChannel | null = null;

/** Start once when the app boots. No tokens or user data are sent between tabs. */
export function startAuthSessionSync(client: QueryClient): () => void {
    if (typeof BroadcastChannel === "undefined") return () => { };

    const channel = new BroadcastChannel(SESSION_CHANNEL_NAME);
    sessionChannel = channel;
    channel.onmessage = (event: MessageEvent<unknown>) => {
        if (!event.data || typeof event.data !== "object" || !("type" in event.data) || event.data.type !== SESSION_CHANGED_EVENT) return;
        // Reset ALL cached user-dependent data (account, orders and cart). Active
        // queries refetch using the cookies that now belong to the new session.
        void client.resetQueries();
    };

    return () => {
        channel.close();
        if (sessionChannel === channel) sessionChannel = null;
    };
}

/** Tell other same-origin tabs to discard data cached under the old session. */
export function announceAuthSessionChange(): void {
    sessionChannel?.postMessage({ type: SESSION_CHANGED_EVENT });
}
