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
  created_at: string;
  updated_at: string;
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
