import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app always calls same-origin /api; vite proxies it to the service in both dev and preview,
// so the built bundle never hard-codes a host. Override the target with API_URL.
const target = process.env.API_URL ?? "http://localhost:8080";
const proxy = { "/api": { target, changeOrigin: true } };

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
});
