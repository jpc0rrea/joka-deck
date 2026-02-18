import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/ws": {
        target: "ws://127.0.0.1:18789",
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/ws/, ""),
      },
    },
  },
  preview: {
    port: 5173,
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".tail2b9fd4.ts.net",
      "macbook-pro-m1-do-joo-pedro.tail2b9fd4.ts.net",
    ],
  },
});
