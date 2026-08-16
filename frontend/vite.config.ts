import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  plugins: [react()],
});
