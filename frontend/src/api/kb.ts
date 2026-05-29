import type { KBDetail, KnowledgeBase, Message, Session } from "../types";
import api from "./client";

export async function listKBs(includeDocs = false) {
  const res = await api.get<KnowledgeBase[] | KBDetail[]>("/kb", {
    params: { include_docs: includeDocs },
  });
  return res.data;
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

export async function clearMessages(kbId: number) {
  return api.delete(`/kb/${kbId}/messages`);
}

export async function refreshToken() {
  const res = await api.post<{ access_token: string; token_type: string; expires_in: number }>(
    "/auth/refresh",
  );
  return res.data;
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
