import type { GiftRule, QueueEntry, QueueInput, QueueSettings } from "@/types/queue";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

type ApiResponse<T> = { data: T; replayed?: boolean };

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const body = await response.json().catch(() => ({})) as { data?: T; replayed?: boolean; error?: { message?: string } };
  if (!response.ok) throw new Error(body.error?.message ?? "Backend request failed");
  return { data: body.data as T, replayed: body.replayed };
}

export type QueueCreateInput = QueueInput & {
  idempotencyKey: string;
  allowDuplicate?: boolean;
  tiktokUserId?: string;
  source?: string;
};

export type QueueQuestionInput = Pick<QueueInput, "displayName" | "tiktokUsername" | "question"> & {
  idempotencyKey: string;
  allowDuplicate?: boolean;
  tiktokUserId?: string;
  source?: string;
};

export async function getQueue() {
  const response = await request<{ entries: QueueEntry[] }>("/api/queue");
  return response.data.entries;
}

export async function getHistory(limit = 200) {
  const response = await request<{ entries: QueueEntry[] }>(`/api/queue/history?limit=${limit}`);
  return response.data.entries;
}

export async function createQueue(input: QueueCreateInput) {
  return request<QueueEntry>("/api/queue", { method: "POST", body: JSON.stringify(input) });
}

export async function createQuestion(input: QueueQuestionInput) {
  return request<QueueEntry>("/api/queue/questions", { method: "POST", body: JSON.stringify(input) });
}

export async function updateQueue(id: string, input: Partial<QueueInput> & { status?: QueueEntry["status"]; allowDuplicate?: boolean }) {
  return request<QueueEntry>(`/api/queue/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

async function mutate(id: string, action: string) {
  const response = await request<QueueEntry>(`/api/queue/${id}/${action}`, { method: "POST" });
  return response.data;
}

export const startQueue = (id: string) => mutate(id, "start");
export const completeQueue = (id: string) => mutate(id, "complete");
export const cancelQueue = (id: string) => mutate(id, "cancel");
export const skipQueue = (id: string) => mutate(id, "skip");
export const restoreQueue = (id: string) => mutate(id, "restore");

export async function deleteQueue(id: string) {
  const response = await request<QueueEntry>(`/api/queue/${id}`, { method: "DELETE" });
  return response.data;
}

export async function getSettings() {
  const response = await request<{ rules: GiftRule[]; settings: QueueSettings }>("/api/settings");
  return response.data;
}

export async function updateSettings(rules: GiftRule[], settings: QueueSettings) {
  const response = await request<{ rules: GiftRule[]; settings: QueueSettings }>("/api/settings", { method: "PUT", body: JSON.stringify({ rules, settings }) });
  return response.data;
}

export { API_URL };
