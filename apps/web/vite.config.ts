import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.API_PROXY_TARGET ?? "http://localhost:4100";

const proxyRules = {
  "/api": {
    target: apiTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4173,
    host: "0.0.0.0",
    proxy: proxyRules,
    watch: {
      usePolling: true,
      interval: 700,
    },
  },
  preview: {
    port: 4173,
    host: "0.0.0.0",
    proxy: proxyRules,
  },
});
