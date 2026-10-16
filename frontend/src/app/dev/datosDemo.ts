/**
 * Datos de demo que **no** están en los fixtures de Bruno (`@/mocks`, B-0.1) — ⚠️ temporal.
 *
 * Ya no se copian pedidos, productos ni ubicaciones: salen de `@/mocks`
 * (`orders`, `products`, `locations`). Aquí solo queda lo que esos fixtures no traen:
 *   - el reloj de la demo y el mes del ciclo (`demo_metadata`);
 *   - la asignación staff → puntos (`point_assignments`), que entregará `useSession()`
 *     de `@/data` (David). `point_assignments`/`staff_members` no son fixtures.
 *
 * `point_assignments` solo aporta `location_id`: el código, el nombre y la ciudad se
 * resuelven desde `@/mocks` (`locations`), para no duplicar esa tabla.
 */
import { locations, type Location } from "@/mocks";

/** `demo_metadata.reference_at` — el reloj de la demo (regla 11 de AGENTS.md). */
export const FECHA_REFERENCIA = "2026-10-10T22:00:00Z";

/** Mes de la demo, tal como aparece en `orders.cycle_month` (oct-2026). */
export const MES_DEMO = "2026-10-01";

/**
 * `point_assignments.location_id` por `staff_members.id` (`db/datos/point_assignments.csv`).
 * El auxiliar (Ana) tiene 3; el supervisor (Luis), 24; el resto, ninguno.
 */
export const PUNTOS_POR_STAFF: Record<string, string[]> = {
  // Ana Demo (auxiliar) → Q-001, Q-005, Q-008
  "054ae798-96a3-56e2-b309-336a4f88b772": [
    "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "85ffdf07-af4c-54ec-8829-1003b49a6879",
    "e12cbeb4-3490-5f21-921d-16d94fa7d5c5",
  ],
  // Luis Demo (supervisor) → los 24 puntos detallados
  "aca13b82-3dc4-538e-8e99-f7760d016163": [
    "704dfcd6-b98d-56ce-8661-bfc410332be8",
    "50756d9d-9267-5fc0-ac92-4ea8f6abdc1a",
    "83ceb3cf-e00e-5994-8a74-84812eecb588",
    "ba44ff75-f5e0-59ad-a1fa-a7dc032c35e6",
    "85ffdf07-af4c-54ec-8829-1003b49a6879",
    "191e60d9-e04d-5f6b-ae71-18833915b11d",
    "26f20a3b-ed43-5992-bacf-2d747abc8a85",
    "e12cbeb4-3490-5f21-921d-16d94fa7d5c5",
    "04a3bad0-73e4-53ef-8c50-ecdd7fe14243",
    "b99a8bfa-409f-5cef-83e0-c282401ba4f2",
    "ac257a20-9323-575f-8ec8-1ceef8a5e999",
    "65dc8678-f7b0-5047-8920-0449f98c7edf",
    "5278b347-937a-56af-a04c-7f328772d459",
    "0b3db3fb-db17-5171-b818-710783741bcf",
    "2b5243d4-361a-5922-9f5f-7653a670bb10",
    "1be05b48-d856-5cd1-b1e8-bfef1eeee7e7",
    "c3d0444f-de56-5e32-b275-854c516b7d5c",
    "4f4f47cc-c97b-5d6f-853c-aa04962c3850",
    "418e8c63-c23d-5f71-95a9-da65f2b0c23a",
    "1fd87662-12ef-5c13-ae5c-b245317ec657",
    "61982fca-0fb1-56cb-8eaf-36c1e4e8fa2d",
    "755fa63c-a56a-5d66-ac3e-1d1f99d4251e",
    "840711da-8638-51f6-b1f1-d09c4bca88aa",
    "5947e50e-ab5b-5baa-8e06-84a67e6f9197",
  ],
};

/**
 * Punto tal como lo devuelve `GET /me` (`schemas.Me.points`): la fila de `locations`
 * recortada a lo que usa la UI. Mismos nombres que el backend (C2).
 */
export type PuntoAsignado = Pick<Location, "id" | "code" | "name" | "city" | "demo_scope">;

/**
 * Puntos asignados a un `staff_id` (`point_assignments`), resueltos contra `@/mocks`.
 * Solo se copian los campos del contrato; nada calculado. Los roles globales (sin
 * asignaciones explícitas) devuelven lista vacía.
 */
export function puntosAsignados(staffId: string): PuntoAsignado[] {
  const ids = PUNTOS_POR_STAFF[staffId] ?? [];
  return locations
    .filter((punto) => ids.includes(punto.id))
    .map(({ id, code, name, city, demo_scope }) => ({ id, code, name, city, demo_scope }));
}
