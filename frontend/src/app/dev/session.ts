import { useEffect, useState } from "react";

import { PUNTOS_POR_STAFF, type PuntoAsignado } from "@/app/dev/datosDemo";

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

/**
 * `staff_members.id` de cada rol del seed (`db/datos/staff_members.csv`).
 * Es lo que en la app real llega firmado en el JWT, nunca desde el cliente.
 */
export const STAFF_ID_POR_ROL: Record<Role, string> = {
  auxiliar: "054ae798-96a3-56e2-b309-336a4f88b772",
  supervisor: "aca13b82-3dc4-538e-8e99-f7760d016163",
  administrador: "a5b961f0-21b2-5119-b94a-139b47f39828",
  bodega: "ede103ca-2997-55af-82cc-547d545c75f2",
  logistica: "e3f6611a-a9f0-5f0d-ad3d-2e02e3bebdcc",
  compras: "d888c5be-d088-58b5-bf2d-17ae33c5bc1a",
  gerencia: "24e3adc4-68d1-5a5e-8a54-7d2929198729",
};

export type Session = {
  /** `staff_members.id` del seed. */
  staffId: string;
  name: string;
  email: string;
  role: Role;
  pointsLabel: string;
  /** Puntos asignados (`point_assignments`): el auxiliar 3, el supervisor 24, el resto 0. */
  puntos: PuntoAsignado[];
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
 * Rol actual **sin hook** (para funciones fuera de React, como el mock `createOrder`).
 * En la app real esto no existe: el rol sale del JWT en el backend.
 */
export function rolActual(): Role {
  return leerRol();
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
  const staffId = STAFF_ID_POR_ROL[role];
  return {
    data: {
      staffId,
      name: meta.name,
      email: meta.email,
      role,
      pointsLabel: meta.pointsLabel,
      puntos: PUNTOS_POR_STAFF[staffId] ?? [],
    },
    isLoading: false,
    isError: false,
  };
}
