import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { queryClient } from "./lib/query-client";
import { startAuthSessionSync } from "./features/auth/lib/session-coordination";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Root element was not found");

startAuthSessionSync(queryClient);

createRoot(root).render(
    <StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></StrictMode>,
);
