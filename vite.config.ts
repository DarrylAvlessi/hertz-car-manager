import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "node:path"

// Vite config — Hertz Bénin, React pur (découplé de Figma Make)
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  server: {
    host: process.env.FIGMA_DEV_SERVER_HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
    strictPort: true,
  },
  preview: {
    host: process.env.FIGMA_DEV_SERVER_HOST || "0.0.0.0",
    port: parseInt(process.env.PORT || "8443"),
  },
})
