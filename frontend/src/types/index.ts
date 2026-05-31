export interface User {
  id: number;
  email: string;
  is_active: boolean;
}

export interface KnowledgeBase {
  id: number;
  name: string;
  document_count: number;
  created_at: string;
}

export interface Document {
  id: number;
  filename: string;
  chunk_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskInfo {
  task_id: string;
  status: string;
  progress: number;
  message: string;
  result?: Record<string, unknown> | null;
}

export interface UploadResult {
  doc_id: number;
  task_id: string;
  status: string;
  sync?: boolean;
}

export interface SourceInfo {
  index: number;
  document_id: number;
  document_name: string;
  snippet: string;
}

export interface AskResponse {
  question: string;
  answer: string;
  sources: SourceInfo[];
}

export interface KBDetail extends KnowledgeBase {
  documents: Document[];
}

export interface Message {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  session_id?: string | null;
  sources?: SourceInfo[];
  feedback?: boolean | null;
  created_at?: string;
  isStreaming?: boolean;
}

export interface Session {
  session_id: string;
  first_question: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: number;
  email: string;
  nickname: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SearchResult {
  session_id: string;
  first_question: string;
  match_snippet: string;
  updated_at: string;
}

export interface KBStats {
  doc_count: number;
  chunk_count: number;
  session_count: number;
  message_count: number;
  last_activity: string | null;
}
