export interface TagOut {
  id: string;
  name: string;
}

export interface NoteOut {
  id: string;
  title: string;
  content_md: string;
  area: string;
  source_type: string;
  source_file: string | null;
  status?: string;
  created_at: string;
  updated_at: string;
  tags: TagOut[];
}

export interface NoteCreate {
  title: string;
  content_md: string;
  area: string;
  tags: string[];
}

export interface NoteUpdate {
  title?: string | null;
  content_md?: string | null;
  area?: string | null;
  tags?: string[] | null;
}

export interface FlashcardOut {
  id: string;
  note_id: string;
  question: string;
  answer: string;
  difficulty: "facil" | "medio" | "dificil";
  card_type?: string;
  metadata_json?: string;
  created_at: string;
}

export interface FlashcardGenerate {
  note_ids: string[];
  difficulty: "facil" | "medio" | "dificil";
  quantity: number;
}

export interface ReviewSubmit {
  flashcard_id: string;
  user_id: string;
  rating: "errei" | "dificil" | "bom" | "facil";
}

export interface ReviewOut {
  id: string;
  flashcard_id: string;
  user_id: string;
  rating: string;
  stability: number;
  difficulty: number;
  next_review: string;
  reviewed_at: string;
}

export interface ChatMessage {
  content: string;
}

export interface ChatResponse {
  content: string;
  sources: string[];
}

export interface UserOut {
  id: string;
  name: string;
  email: string | null;
  whatsapp_id: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  user: UserOut;
}

export interface ImportResult {
  note_id: string;
  title: string;
  source_type: string;
}

export interface GraphNode {
  id: string;
  label: string;
  area: string;
  tags: string[];
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DashboardStats {
  notes: NoteOut[];
  cards: FlashcardOut[];
  tags: TagOut[];
  graph: GraphData;
}

export interface HealthResponse {
  status: string;
  service: string;
  database: string;
}

export interface SettingsResponse {
  embedding_model: string;
  similarity_threshold: number;
  chunk_size: number;
  chunk_overlap: number;
  environment: string;
}
