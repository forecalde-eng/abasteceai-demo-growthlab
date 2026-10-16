import { credencialDeRol } from "@/app/dev/credencialesDev";
import { setDevRole } from "@/app/dev/roles";
import { useMocks, type Role } from "@/data";

/**
 * Cambio de cuenta de la demo (J-3.2) - **solo modo dev**.
 *
 * Un único punto de entrada, `cambiarCuenta(rol)`, para el pitch: pasar de una cuenta
 * demo a otra sin escribir credenciales. El menú de la barra lateral
 * (`DevAccountSwitcher`) lo resuelve en dos clics (abrir y elegir).
 *
 * - **Modo mocks** (`VITE_USE_MOCKS=true`): no hay login real; basta con guardar el rol,
 *   que leen `src/data/useSession` y `src/app/dev/apiDemo`.
 * - **Modo real** (J-0.3): firma con Supabase (`signInWithPassword`). La contraseña
 *   **nunca sale del bundle**: la trae `credencialDeRol`, que la lee del endpoint local
 *   `GET /__dev/credentials` (plugin `vite-plugins/devCredentials.ts`, solo `vite dev`).
 *   En una build de producción esa ruta no existe, y el login pide las credenciales a mano.
 *
 * NO ES SEGURIDAD: ni el rol ni las contraseñas protegen los datos. Quien manda de verdad
 * es la base (RLS + JWT, invariante I8).
 */

/**
 * Pantalla principal de cada rol (`docs/04_SPEC_MAESTRA.md §2`). Al cambiar de cuenta se
 * navega aquí para no aterrizar en una pantalla que el rol nuevo no puede ver (SinAcceso).
 */
export const PANTALLA_PRINCIPAL: Record<Role, string> = {
  auxiliar: "/pedidos",
  supervisor: "/supervisor",
  administrador: "/admin",
  bodega: "/bodega/preparar",
  logistica: "/logistica/mapa",
  compras: "/compras",
  gerencia: "/tablero",
};

/**
 * Cambia la cuenta activa.
 *
 * En modo mocks es el mismo almacén de siempre (`abasteceai.dev.role`); en modo real,
 * cambia la sesión de Supabase Auth. Lanza `Error` con un mensaje legible si no hay
 * credenciales o si el servidor rechaza la entrada.
 */
export async function cambiarCuenta(rol: Role): Promise<void> {
  if (useMocks) {
    setDevRole(rol);
    return;
  }

  // --- Login real (J-0.3): Supabase Auth, contraseñas FUERA del bundle ---
  const cred = await credencialDeRol(rol);
  if (!cred) {
    throw new Error(
      `No hay credenciales locales para la cuenta "${rol}". ` +
        `Crea el fichero del endpoint dev (vite-plugins/devCredentials.ts) o entra desde /login.`,
    );
  }
  const { getSupabaseClient } = await import("@/data/supabase");
  const { error } = await getSupabaseClient().auth.signInWithPassword(cred);
  if (error) throw new Error(`No se pudo entrar como "${rol}": ${error.message}`);
}
