import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const apiTarget = process.env.VITE_API_TARGET || "http://localhost:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  // three.js is one ~500 kB chunk (about 130 kB gzipped) that only loads when you start playing.
  build: { chunkSizeWarningLimit: 600 },
  test: { environment: "node" },
});
