const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
    throw new Error(err.detail || "Erro na requisicao");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  notes: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<any[]>(`/api/notes${qs}`);
    },
    get: (id: string) => request<any>(`/api/notes/${id}`),
    create: (data: any) => request<any>("/api/notes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<any>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/notes/${id}`, { method: "DELETE" }),
  },
  graph: {
    get: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<any>(`/api/notes/graph/data${qs}`);
    },
  },
  flashcards: {
    generate: (data: any) => request<any[]>("/api/flashcards/generate", { method: "POST", body: JSON.stringify(data) }),
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<any[]>(`/api/flashcards${qs}`);
    },
    review: (data: any) => request<any>("/api/flashcards/review", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/flashcards/${id}`, { method: "DELETE" }),
  },
  chat: {
    send: (content: string) => request<any>("/api/chat", { method: "POST", body: JSON.stringify({ content }) }),
  },
  tags: {
    list: () => request<any[]>("/api/notes/tags"),
  },
};
