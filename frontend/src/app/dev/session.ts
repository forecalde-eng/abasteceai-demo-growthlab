import { useEffect, useState } from "react";

/**
 * ⚠️ SESIÓN TEMPORAL — NO ES EL LOGIN REAL.
 *
 * Sustituye a `useSession()` de `src/data/` (David, contrato C2) mientras esa capa
 * no exista. Todavía no hay autenticación (J-0.3), así que el rol se elige a mano.
 *
 * NO ES UNA MEDIDA DE SEGURIDAD: es solo para que se vea el layout por rol. Quien
 * manda de verdad es la base (RLS + JWT, invariante I8); la UI nunca se fía de sí misma.
 *
 * Para pasar a datos reales (cuando David entregue `src/data/`):
 *   1. `USAR_SESION_TEMPORAL = false` (quita el selector de rol de la interfaz).
 *   2. Cambiar los imports de `@/app/dev/session` a `@/data` en las pantallas.
 */

export const USAR_SESION_TEMPORAL = true;

/** Los 7 roles del seed (`db/01_esquema.sql` · `staff_members.role`). */
export type Role =
  | "auxiliar"
  | "supervisor"
  | "administrador"
  | "bodega"
  | "logistica"
  | "compras"
  | "gerencia";

export type RoleMeta = {
  label: string;
  /** Identidades del seed (spec §2). */
  name: string;
  email: string;
  /** Puntos visibles por RLS, tal como los describe la spec §2. */
  pointsLabel: string;
};

export const ROLES: Record<Role, RoleMeta> = {
  auxiliar: {
    label: "Auxiliar",
    name: "Ana Demo",
    email: "auxiliar@abasteceai.example",
    pointsLabel: "Q-001, Q-005, Q-008",
  },
  supervisor: {
    label: "Supervisor",
    name: "Luis Demo",
    email: "supervisor@abasteceai.example",
    pointsLabel: "24 puntos detallados",
  },
  administrador: {
    label: "Administrador",
    name: "Carla Demo",
    email: "administrador@abasteceai.example",
    pointsLabel: "703 puntos",
  },
  bodega: {
    label: "Bodega",
    name: "Diego Demo",
    email: "bodega@abasteceai.example",
    pointsLabel: "703 puntos",
  },
  logistica: {
    label: "Logística",
    name: "Elena Demo",
    email: "logistica@abasteceai.example",
    pointsLabel: "703 puntos",
  },
  compras: {
    label: "Compras",
    name: "Fabian Demo",
    email: "compras@abasteceai.example",
    pointsLabel: "703 puntos",
  },
  gerencia: {
    label: "Gerencia",
    name: "Gabriela Demo",
    email: "gerencia@abasteceai.example",
    pointsLabel: "703 puntos",
  },
};

/** Orden para el selector (mismo orden de la spec §2). */
export const ROLE_ORDER: Role[] = [
  "auxiliar",
  "supervisor",
  "administrador",
  "bodega",
  "logistica",
  "compras",
  "gerencia",
];

export type Session = {
  name: string;
  email: string;
  role: Role;
  pointsLabel: string;
};

const STORAGE_KEY = "abasteceai.dev.role";
const ROLE_POR_DEFECTO: Role = "administrador";
const EVENTO = "abasteceai:role-change";

function esRol(v: string | null): v is Role {
  return v !== null && Object.prototype.hasOwnProperty.call(ROLES, v);
}

function leerRol(): Role {
  try {
    const guardado = window.localStorage.getItem(STORAGE_KEY);
    if (esRol(guardado)) return guardado;
  } catch {
    /* localStorage puede no estar disponible */
  }
  return ROLE_POR_DEFECTO;
}

/** Cambia el rol de prueba (solo tiene efecto con la sesión temporal). */
export function setDevRole(role: Role): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    /* ignora */
  }
  window.dispatchEvent(new Event(EVENTO));
}

/**
 * Forma provisional: imita el resultado de React Query (`data`/`isLoading`/`isError`)
 * para que el cambio a `src/data/useSession` no obligue a reescribir pantallas.
 */
export function useSession(): {
  data: Session | null;
  isLoading: boolean;
  isError: boolean;
} {
  const [role, setRole] = useState<Role>(leerRol);

  useEffect(() => {
    const actualizar = () => setRole(leerRol());
    window.addEventListener(EVENTO, actualizar);
    window.addEventListener("storage", actualizar);
    return () => {
      window.removeEventListener(EVENTO, actualizar);
      window.removeEventListener("storage", actualizar);
    };
  }, []);

  const meta = ROLES[role];
  return {
    data: {
      name: meta.name,
      email: meta.email,
      role,
      pointsLabel: meta.pointsLabel,
    },
    isLoading: false,
    isError: false,
  };
}
