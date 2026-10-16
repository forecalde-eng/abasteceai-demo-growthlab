import type { Role } from "@/data";

/**
 * Credenciales de las cuentas demo para el **login real** (J-0.3).
 *
 * NUNCA viven en el bundle: `VITE_*` se inlinea en el JavaScript del navegador, así que
 * meter aquí las contraseñas las expondría. En modo dev, el plugin
 * `vite-plugins/devCredentials.ts` sirve `GET /__dev/credentials` desde un fichero local
 * **fuera del repo** (por defecto `%LOCALAPPDATA%\AbasteceAI\D-0.3\demo-credentials.json`).
 *
 * En la build de producción ese endpoint no existe y `cargarCredencialesDev` devuelve un
 * mapa vacío: el login pide las credenciales a mano. Nada sensible acaba en el bundle.
 */

export type CredencialDev = { email: string; password: string };
export type CredencialesDev = Partial<Record<Role, CredencialDev>>;

const ENDPOINT = "/__dev/credentials";

const ROLES_VALIDOS: readonly string[] = [
  "auxiliar",
  "supervisor",
  "administrador",
  "bodega",
  "logistica",
  "compras",
  "gerencia",
];

/**
 * Valida y normaliza el JSON que sirve el endpoint. Es una **función pura** (se prueba sin
 * red): descarta claves que no son roles y entradas sin `email` o `password`.
 */
export function normalizarCredenciales(raw: unknown): CredencialesDev {
  if (typeof raw !== "object" || raw === null) return {};

  const salida: CredencialesDev = {};
  for (const [clave, valor] of Object.entries(raw as Record<string, unknown>)) {
    if (!ROLES_VALIDOS.includes(clave)) continue;
    if (typeof valor !== "object" || valor === null) continue;

    const { email, password } = valor as Record<string, unknown>;
    if (typeof email !== "string" || email.length === 0) continue;
    if (typeof password !== "string" || password.length === 0) continue;

    salida[clave as Role] = { email, password };
  }
  return salida;
}

/** Carga el mapa de credenciales. Solo en dev; en producción (o sin endpoint) devuelve `{}`. */
export async function cargarCredencialesDev(): Promise<CredencialesDev> {
  if (!import.meta.env.DEV) return {};

  try {
    const respuesta = await fetch(ENDPOINT, { headers: { Accept: "application/json" } });
    if (!respuesta.ok) return {};
    return normalizarCredenciales(await respuesta.json());
  } catch {
    return {};
  }
}

/** Credencial de un rol, o `null` si no está disponible en local. */
export async function credencialDeRol(rol: Role): Promise<CredencialDev | null> {
  const credenciales = await cargarCredencialesDev();
  return credenciales[rol] ?? null;
}
