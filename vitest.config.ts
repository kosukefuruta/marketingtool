import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// Match the "@/*" paths mapping in tsconfig.json so tests can import modules the way the app does.
export default defineConfig({
  resolve: {
    alias: { "@/": fileURLToPath(new URL("./", import.meta.url)) },
  },
})
