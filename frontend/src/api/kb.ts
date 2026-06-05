import type {
  KBDetail,
  KnowledgeBase,
  Message,
  PaginatedResponse,
  SearchResult,
  Session,
  TaskInfo,
  UploadResult,
} from "../types";
import api from "./client";

export async function listKBs(includeDocs = false) {
  const res = await api.get<PaginatedResponse<KnowledgeBase> | PaginatedResponse<KBDetail>>("/kb", {
    params: { include_docs: includeDocs },
  });
  return res.data.items;
}

export async function createKB(name: string) {
  const res = await api.post<KnowledgeBase>("/kb", { name });
  return res.data;
}

export async function renameKB(id: number, name: string) {
  const res = await api.put<KnowledgeBase>(`/kb/${id}`, { name });
  return res.data;
}

export async function deleteKB(id: number) {
  const res = await api.delete(`/kb/${id}`);
  return res.data;
}

export async function addDocument(kbId: number, content: string, filename: string) {
  const res = await api.post(`/kb/${kbId}/docs`, { content, filename });
  return res.data;
}

export async function updateDocument(kbId: number, docId: number, content: string) {
  const res = await api.put(`/kb/${kbId}/docs/${docId}`, { content });
  return res.data;
}

export async function deleteDocument(kbId: number, docId: number) {
  return api.delete(`/kb/${kbId}/docs/${docId}`);
}

export async function renameDocument(kbId: number, docId: number, filename: string) {
  const res = await api.put(`/kb/${kbId}/docs/${docId}/rename`, { filename });
  return res.data;
}

export async function getDocContent(kbId: number, docId: number) {
  const res = await api.get<{ content: string }>(`/kb/${kbId}/docs/${docId}/content`);
  return res.data;
}

export async function listDocuments(kbId: number, page = 1, pageSize = 200) {
  const res = await api.get<Document[]>(`/kb/${kbId}/docs`, {
    params: { page, page_size: pageSize },
  });
  return res.data;
}

export async function uploadFile(kbId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post(`/kb/${kbId}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function listMessages(kbId: number, page = 1, pageSize = 50) {
  const res = await api.get<Message[]>(`/kb/${kbId}/messages`, {
    params: { page, page_size: pageSize },
  });
  return res.data;
}

export async function clearMessages(kbId: number, sessionId?: string | null) {
  const params = sessionId ? { session_id: sessionId } : {};
  return api.delete(`/kb/${kbId}/messages`, { params });
}

export async function listSessions(kbId: number) {
  const res = await api.get<Session[]>(`/kb/${kbId}/sessions`);
  return res.data;
}

export async function listSessionMessages(kbId: number, sessionId: string) {
  const res = await api.get<Message[]>(`/kb/${kbId}/sessions/${sessionId}/messages`);
  return res.data;
}

export async function deleteSession(kbId: number, sessionId: string) {
  return api.delete(`/kb/${kbId}/sessions/${sessionId}`);
}

export async function submitFeedback(messageId: number, feedback: boolean) {
  return api.patch(`/messages/${messageId}/feedback`, null, {
    params: { feedback },
  });
}

export async function searchMessages(kbId: number, q: string) {
  const res = await api.get<SearchResult[]>(`/kb/${kbId}/search-messages`, {
    params: { q },
  });
  return res.data;
}

export async function uploadFileAsync(kbId: number, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await api.post<UploadResult>(`/kb/${kbId}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function pollTask(taskId: string) {
  const res = await api.get<TaskInfo>(`/kb/tasks/${taskId}`);
  return res.data;
}

export async function batchDeleteDocuments(kbId: number, docIds: number[]) {
  const res = await api.post<{ deleted_count: number }>(`/kb/${kbId}/docs/batch-delete`, {
    doc_ids: docIds,
  });
  return res.data;
}
