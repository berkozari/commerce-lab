import { apiRequest } from "../../../lib/api-client";

export type HealthResponse = { status: string; service?: string };
export function getHealth(): Promise<HealthResponse> {
    return apiRequest<HealthResponse>("/api/v1/health");
}
