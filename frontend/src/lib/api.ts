const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit & { token?: string }): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options?.headers as Record<string, string>),
  };

  const token = options?.token || (typeof window !== "undefined" ? localStorage.getItem("zapcards_token") : null);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
    throw new Error(err.detail || "Erro na requisicao");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  auth: {
    register: (data: { name: string; email?: string; password?: string; whatsapp_id?: string }) =>
      request<any>("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
    login: (data: { email?: string; whatsapp_id?: string; password: string }) =>
      request<any>("/api/auth/login", { method: "POST", body: JSON.stringify(data) }),
    me: (token?: string) => request<any>("/api/auth/me", { token }),
  },
  notes: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<any[]>(`/api/notes${qs}`);
    },
    get: (id: string) => request<any>(`/api/notes/${id}`),
    create: (data: any) => request<any>("/api/notes", { method: "POST", body: JSON.stringify(data) }),
    update: (id: string, data: any) =>
      request<any>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/notes/${id}`, { method: "DELETE" }),
  },
  graph: {
    get: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<any>(`/api/notes/graph/data${qs}`);
    },
  },
  flashcards: {
    generate: (data: any) =>
      request<any[]>("/api/flashcards/generate", { method: "POST", body: JSON.stringify(data) }),
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<any[]>(`/api/flashcards${qs}`);
    },
    review: (data: any) =>
      request<any>("/api/flashcards/review", { method: "POST", body: JSON.stringify(data) }),
    delete: (id: string) => request<void>(`/api/flashcards/${id}`, { method: "DELETE" }),
    due: (userId: string) => request<any[]>(`/api/flashcards/due?user_id=${userId}`),
  },
  chat: {
    send: (content: string) =>
      request<any>("/api/chat", { method: "POST", body: JSON.stringify({ content }) }),
  },
  tags: {
    list: () => request<any[]>("/api/notes/tags"),
  },
  stats: {
    dashboard: async () => {
      const [notes, cards, tags, graph] = await Promise.all([
        api.notes.list(),
        api.flashcards.list(),
        api.tags.list(),
        api.graph.get(),
      ]);
      return { notes, cards, tags, graph };
    },
  },
};
