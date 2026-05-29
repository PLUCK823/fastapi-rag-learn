import type { Profile } from "../types";
import api from "./client";

export async function register(email: string, password: string) {
  const res = await api.post("/auth/register", { email, password });
  return res.data;
}

export async function login(username: string, password: string) {
  const form = new URLSearchParams();
  form.set("username", username);
  form.set("password", password);
  const res = await api.post("/auth/login", form);
  return res.data;
}

export async function getProfile() {
  const res = await api.get<Profile>("/auth/me");
  return res.data;
}

export async function updateNickname(nickname: string) {
  const res = await api.put<Profile>("/auth/me", { nickname });
  return res.data;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const res = await api.put("/auth/me/password", {
    old_password: oldPassword,
    new_password: newPassword,
  });
  return res.data;
}

export async function refreshToken() {
  const res = await api.post("/auth/refresh");
  return res.data as { access_token: string; token_type: string; expires_in: number };
}
