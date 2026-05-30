import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const BACKEND = process.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/auth": BACKEND,
      "/kb": BACKEND,
      "/ask": BACKEND,
      "/ws": { target: BACKEND.replace("http", "ws"), ws: true },
      "/health": BACKEND,
    },
  },
});
