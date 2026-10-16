import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // La recepción móvil (spec §9) se prueba desde el teléfono por la IP LAN.
    host: true,
  },
  test: {
    // generate.test.mjs es de node:test (no de vitest) y vive con los generadores de mocks.
    exclude: [...configDefaults.exclude, "src/mocks/**"],
  },
});
