/**
 * Metadatos de los 7 roles de la demo (J-0.3 / J-3.2).
 *
 * Aquí ya **no** vive la sesión: la entrega `useSession()` de `@/data` (contrato C2),
 * que funciona en modo mocks (sesión por rol) y en modo real (Supabase Auth + RLS).
 *
 * Este módulo solo guarda lo que es de la demo:
 *   - etiquetas y nombres (texto de pantalla, `spec §2`);
 *   - el `staff_id` del seed que usan los mocks y las escrituras simuladas;
 *   - el rol temporal (`abasteceai.dev.role`), que **solo** tiene efecto con
 *     `VITE_USE_MOCKS=true` (lo lee `src/data/useSession.ts` y `src/app/dev/apiDemo.ts`).
 */

import type { Role } from "@/data";

export type RoleMeta = {
  label: string;
  /** Identidad del seed (spec §2). */
  name: string;
  email: string;
  /**
   * Texto de pantalla de la demo (spec §2). **No** forma parte de `GET /me`: con la capa
   * real se calcula en el componente a partir de `points`.
   */
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

/**
 * Rol actual **sin hook** (para funciones fuera de React, como el mock `createOrder`).
 * En la app real esto no existe: el rol sale del JWT en el backend.
 */
export function rolActual(): Role {
  return leerRol();
}

/** Cambia el rol de prueba (solo tiene efecto con la sesión temporal / mocks). */
export function setDevRole(role: Role): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, role);
  } catch {
    /* ignora */
  }
  window.dispatchEvent(new Event(EVENTO));
}
