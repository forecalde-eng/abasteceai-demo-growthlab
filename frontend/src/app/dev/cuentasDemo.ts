import { ROLES, setDevRole, USAR_SESION_TEMPORAL, type Role } from "@/app/dev/session";

/**
 * Cambio de cuenta de la demo (J-3.2) — **solo modo dev**.
 *
 * Un único punto de entrada, `cambiarCuenta(rol)`, para el pitch: pasar de una cuenta
 * demo a otra sin escribir credenciales. El menú de la barra lateral
 * (`DevAccountSwitcher`) lo resuelve en dos clics (abrir y elegir).
 *
 * Hoy no hay login real (J-0.3 / D-0.3), así que cambiar de cuenta es cambiar el rol de
 * la sesión temporal. Cuando el login exista, **solo hay que usar la rama de abajo**: firma
 * con Supabase (`signInWithPassword`) usando la contraseña de `frontend/.env.local`.
 *
 * NO ES SEGURIDAD. Las contraseñas viven solo en `frontend/.env.local` (ignorado por git);
 * nunca se versionan. Ver `frontend/.env.example` para los nombres de las claves (vacías).
 */

/** Mismo criterio que `src/data/supabase.ts` (`VITE_USE_MOCKS`). */
const USAR_MOCKS = import.meta.env.VITE_USE_MOCKS === "true";

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
 * Credenciales de una cuenta demo: `staff_members.demo_email` (+ override) y la contraseña
 * de `.env.local`. Devuelve `null` si no hay contraseña configurada.
 */
export function credencialesDemo(rol: Role): { email: string; password: string } | null {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const sufijo = rol.toUpperCase();
  const email = env[`VITE_DEMO_EMAIL_${sufijo}`] || ROLES[rol].email;
  const password = env[`VITE_DEMO_PASSWORD_${sufijo}`];
  return password ? { email, password } : null;
}

/**
 * Cambia la cuenta activa. Con sesión temporal o mocks, guarda el rol en el mismo almacén
 * que leen `@/app/dev/session` y `src/data/useSession` (`abasteceai.dev.role`).
 *
 * ⚠️ La firma real (`signInWithPassword`) se activa cuando se apaguen la sesión temporal y
 * los mocks; hasta entonces no se ejecuta ni se importa Supabase.
 */
export async function cambiarCuenta(rol: Role): Promise<void> {
  if (USAR_SESION_TEMPORAL || USAR_MOCKS) {
    setDevRole(rol);
    return;
  }

  // --- Login real (J-0.3): cuando la sesión temporal y los mocks estén apagados ---
  const cred = credencialesDemo(rol);
  if (!cred) {
    throw new Error(
      `Falta la contraseña de la cuenta demo "${rol}". ` +
        `Agrega VITE_DEMO_PASSWORD_${rol.toUpperCase()} en frontend/.env.local.`,
    );
  }
  const { getSupabaseClient } = await import("@/data/supabase");
  const { error } = await getSupabaseClient().auth.signInWithPassword(cred);
  if (error) throw new Error(`No se pudo entrar como "${rol}": ${error.message}`);
}
