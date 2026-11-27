import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Les appels /api sont redirigés vers Django (pas de souci CORS en dev)
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.VITE_PROXY_TARGET || "http://localhost:8000",
    },
    watch: { usePolling: true }, // nécessaire pour le hot-reload via volume Docker (Windows/Mac)
  },
});
