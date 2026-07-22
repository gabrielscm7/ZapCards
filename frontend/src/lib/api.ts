import type {
  ChatResponse,
  DashboardStats,
  FlashcardGenerate,
  FlashcardOut,
  GraphData,
  HealthResponse,
  ImportResult,
  NoteCreate,
  NoteOut,
  NoteUpdate,
  ReviewOut,
  ReviewSubmit,
  TagOut,
  TokenResponse,
} from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public detail: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options?: RequestInit & { token?: string },
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...(options?.headers as Record<string, string>),
  };

  const token =
    options?.token ||
    (typeof window !== "undefined"
      ? localStorage.getItem("zapcards_token")
      : null);
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
    throw new ApiError(
      err.detail || "Erro na requisicao",
      res.status,
      err,
    );
  }

  return res.json();
}

export const api = {
  auth: {
    register: (data: {
      name: string;
      email?: string;
      password?: string;
      whatsapp_id?: string;
    }) =>
      request<TokenResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    login: (data: {
      email?: string;
      whatsapp_id?: string;
      password: string;
    }) =>
      request<TokenResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    me: (token?: string) =>
      request<TokenResponse["user"]>("/api/auth/me", { token }),
  },

  notes: {
    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<NoteOut[]>(`/api/notes${qs}`);
    },

    get: (id: string) => request<NoteOut>(`/api/notes/${id}`),

    create: (data: NoteCreate) =>
      request<NoteOut>("/api/notes", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    update: (id: string, data: NoteUpdate) =>
      request<NoteOut>(`/api/notes/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/api/notes/${id}`, { method: "DELETE" }),

    import: (formData: FormData) =>
      request<ImportResult>("/api/notes/import", {
        method: "POST",
        body: formData,
      }),

    link: (noteId: string, targetId: string) =>
      request<{ status: string }>(`/api/notes/${noteId}/link/${targetId}`, {
        method: "POST",
      }),

    unlink: (noteId: string, targetId: string) =>
      request<void>(`/api/notes/${noteId}/link/${targetId}`, {
        method: "DELETE",
      }),
  },

  graph: {
    get: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<GraphData>(`/api/notes/graph/data${qs}`);
    },
  },

  flashcards: {
    generate: (data: FlashcardGenerate) =>
      request<FlashcardOut[]>("/api/flashcards/generate", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    list: (params?: Record<string, string>) => {
      const qs = params ? "?" + new URLSearchParams(params).toString() : "";
      return request<FlashcardOut[]>(`/api/flashcards${qs}`);
    },

    review: (data: ReviewSubmit) =>
      request<ReviewOut>("/api/flashcards/review", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      request<void>(`/api/flashcards/${id}`, { method: "DELETE" }),

    due: (userId: string) =>
      request<FlashcardOut[]>(`/api/flashcards/due?user_id=${userId}`),
  },

  chat: {
    send: (content: string) =>
      request<ChatResponse>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
  },

  tags: {
    list: () => request<TagOut[]>("/api/notes/tags"),
  },

  health: {
    check: () => request<HealthResponse>("/api/health"),
  },

  stats: {
    dashboard: async (): Promise<DashboardStats> => {
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

export { ApiError };
