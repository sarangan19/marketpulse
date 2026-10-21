import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // amazon-cognito-identity-js expects Node's `global`.
  define: { global: "globalThis" },
  server: { port: 5173 },
  test: { environment: "node" },
});
