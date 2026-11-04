import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 4174,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://api-3m30cm:4100",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  define: {
    __GOOGLE_CLIENT_ID__: JSON.stringify(process.env.GOOGLE_CLIENT_ID ?? ""),
  },
});
