import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Plugin } from "vite";

/**
 * Endpoint **solo-dev** que sirve las credenciales de las cuentas demo (J-0.3) sin
 * meterlas en el bundle.
 *
 * - `apply: "serve"` → no existe en `vite build`; el bundle nunca las contiene.
 * - Lee un fichero local **fuera del repo**, por defecto
 *   `%LOCALAPPDATA%\AbasteceAI\D-0.3\demo-credentials.json` (se puede cambiar con la
 *   variable de entorno `ABASTECEAI_DEV_CREDENTIALS`).
 * - El fichero lo crea el operador a partir de las contraseñas de la bóveda
 *   (`db/tools/d03-provision-auth`: `node provision.mjs copy-password <rol>`).
 *
 * Formato esperado:
 *   { "auxiliar": { "email": "...", "password": "..." }, ... }
 */
const ENDPOINT = "/__dev/credentials";

function rutaPorDefecto(): string {
  const base = process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share");
  return join(base, "AbasteceAI", "D-0.3", "demo-credentials.json");
}

export function devCredentials(): Plugin {
  const fichero = process.env.ABASTECEAI_DEV_CREDENTIALS ?? rutaPorDefecto();

  return {
    name: "abasteceai-dev-credentials",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(ENDPOINT, async (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store");

        try {
          const contenido = await readFile(fichero, "utf8");
          res.statusCode = 200;
          res.end(contenido);
        } catch {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: `No hay credenciales demo en ${fichero}` }));
        }
      });
    },
  };
}
