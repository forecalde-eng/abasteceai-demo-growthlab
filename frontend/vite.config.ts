import { fileURLToPath, URL } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { configDefaults, defineConfig } from "vitest/config";

import { devCredentials } from "./vite-plugins/devCredentials";

export default defineConfig({
  // `devCredentials` sirve `GET /__dev/credentials` SOLO con `vite dev` (`apply: "serve"`),
  // desde un fichero fuera del repo: las contraseñas demo nunca entran en el bundle (J-0.3).
  plugins: [react(), tailwindcss(), devCredentials()],
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
