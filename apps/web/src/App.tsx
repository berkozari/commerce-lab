import { useEffect, useState } from "react";

type HealthStatus = "checking" | "healthy" | "unavailable";

export function App() {
    const [status, setStatus] = useState<HealthStatus>("checking");

    useEffect(() => {
        const controller = new AbortController();
        async function checkHealth() {
            try {
                const response = await fetch("/api/v1/health", { signal: controller.signal });
                if (!response.ok) throw new Error("Health endpoint failed");
                setStatus("healthy");
            } catch (error) {
                if (!controller.signal.aborted) {
                    console.error("API health check failed", error);
                    setStatus("unavailable");
                }
            }
        }
        void checkHealth();
        return () => controller.abort();
    }, []);

    return (
        <main className="page">
            <p className="eyebrow">CommerceLab · EC-001</p>
            <h1>A better foundation for modern commerce.</h1>
            <p>React, TypeScript, Vite and Express are connected. The storefront comes next.</p>
            <div className="status" role="status">
                API status: <strong>{status}</strong>
            </div>
        </main>
    );
}
